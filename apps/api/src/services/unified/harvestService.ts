/**
 * Unified Harvest Service
 * Consolidates all harvest collection, processing, and storage functionality
 * Replaces: harvestService, harvestFileCollector, harvest-related APIs
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { db, redis } from '../../database/connection';
import { unifiedWebSocketManager } from '../../websocket/UnifiedWebSocketManager';
import { logger, LogCategory } from '../../utils/logger';
import { pathConfig, getPath, getFarmWorkspacePath } from '../../config/paths';
import { stateCoordinator } from './stateCoordinator';
import { farmService } from './farmService';
import type { Farm, FarmStatus } from '../../types/farm';
import { validateJSON, sanitizeJSONForDB } from '../../utils/errors';
import { isAgentArray } from '../../../../shared/utils/farmHelpers';

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
  summary?: any;
  yield?: any[];
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

export class UnifiedHarvestService extends EventEmitter {
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

    // Farm events handled through direct service calls instead of event emitters
  }

  private async loadHarvests(): Promise<void> {
    try {
      // PERFORMANCE FIX: Added LIMIT to prevent unbounded loading on startup
      // Older harvests can be loaded on-demand when accessed
      const result = await db.query(`
        SELECT * FROM harvests
        WHERE status != 'deleted'
        ORDER BY created_at DESC
        LIMIT 1000
      `);

      for (const row of result.rows) {
        this.cacheHarvest(this.rowToHarvest(row));
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
    let summary = row.summary;
    if (typeof summary === 'string') {
      try {
        summary = JSON.parse(summary);
      } catch {
        // keep original string if parsing fails
      }
    }

    return {
      id: row.id,
      farmId: row.farm_id,
      farmName: row.farm_name,
      userId: row.user_id,
      status: row.status,
      artifacts: row.artifacts || [],
      yield: row.yield || [],
      metadata: row.metadata || {},
      summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at
    };
  }

  private cacheHarvest(harvest: HarvestData): HarvestData {
    this.harvests.set(harvest.id, harvest);
    return harvest;
  }

  private async loadHarvestFromDb(harvestId: string): Promise<HarvestData | null> {
    try {
      const result = await db.query('SELECT * FROM harvests WHERE id = $1', [harvestId]);
      if (result.rows.length === 0) {
        return null;
      }

      return this.cacheHarvest(this.rowToHarvest(result.rows[0]));
    } catch (error) {
      logger.error('Failed to load harvest from database:', error);
      return null;
    }
  }

  /**
   * Create a new harvest
   */
  public async createHarvest(input: HarvestCreateInput): Promise<HarvestData> {
    // Validate that userId is provided
    if (!input.userId) {
      throw new Error('userId is required to create a harvest');
    }

    const userId = input.userId;

    const harvest: HarvestData = {
      id: uuidv4(),
      farmId: input.farmId,
      farmName: input.farmName,
      userId: userId,
      status: HarvestStatus.PENDING,
      artifacts: [],
      yield: [],
      metadata: {
        totalAgents: 0,
        completedAgents: 0,
        totalFiles: 0,
        totalSize: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database with JSON validation
    try {
      // Validate metadata before insertion
      const metadataValidation = validateJSON(harvest.metadata, 'harvest metadata');
      if (!metadataValidation.valid) {
        logger.warn(LogCategory.HARVEST, 'Invalid metadata during harvest creation', {
          harvestId: harvest.id,
          error: metadataValidation.error
        });
        // Sanitize to prevent database errors
        harvest.metadata = sanitizeJSONForDB(harvest.metadata) as any;
      }

      await db.query(`
        INSERT INTO harvests (id, farm_id, farm_name, user_id, created_by, status, metadata, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [harvest.id, harvest.farmId, harvest.farmName, harvest.userId, harvest.userId, harvest.status,
          JSON.stringify(harvest.metadata), harvest.createdAt, harvest.updatedAt]);
    } catch (error) {
      logger.error(LogCategory.HARVEST, 'Failed to create harvest in database', {
        harvestId: harvest.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }

    this.cacheHarvest(harvest);

    // Emit event
    this.emit('harvest:created', harvest);
    unifiedWebSocketManager.broadcast('harvest:created', harvest);

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
    const updated = await this.updateHarvestInDb(harvest);
    Object.assign(harvest, updated);

    // CRITICAL FIX: Await collection process to prevent race condition
    // Previously this was fire-and-forget, causing empty harvests when
    // completeHarvest() was called before collection finished
    await this.startCollection(harvest);

    return harvest;
  }

  public async updateHarvest(id: string, updates: Partial<HarvestData>): Promise<HarvestData | null> {
    const existing = this.harvests.get(id) ?? await this.loadHarvestFromDb(id);

    if (!existing) {
      logger.warn(`Attempted to update unknown harvest ${id}`);
      return null;
    }

    const merged: HarvestData = {
      ...existing,
      ...updates,
      artifacts: updates.artifacts ?? existing.artifacts ?? [],
      yield: updates.yield ?? existing.yield ?? [],
      metadata: {
        ...existing.metadata,
        ...(updates.metadata ?? {})
      },
      summary: updates.summary ?? existing.summary,
      updatedAt: updates.updatedAt ?? new Date()
    };

    if (updates.completedAt === null) {
      merged.completedAt = undefined;
    } else if (typeof updates.completedAt !== 'undefined') {
      merged.completedAt = updates.completedAt;
    }

    const updated = await this.updateHarvestInDb(merged);
    this.emit('harvest:updated', updated);
    unifiedWebSocketManager.broadcast('harvest:updated', updated);
    return updated;
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

      // Use reconstructed path for reliability - farm.workspacePath may be empty in cache
      let workspacePath = farm.workspacePath;
      if (!workspacePath) {
        // Reconstruct path from farm ID - this is the reliable fallback
        workspacePath = getFarmWorkspacePath(harvest.farmId);
        logger.info(LogCategory.HARVEST, `Using reconstructed workspace path: ${workspacePath}`);
      }

      if (!workspacePath) {
        throw new Error(`Cannot determine workspace path for farm ${harvest.farmId}`);
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

      Object.assign(harvest, await this.updateHarvestInDb(harvest));

      // Process harvest (generate summary, etc.)
      await this.processHarvest(harvest);

    } catch (error) {
      logger.error(`Failed to collect harvest for farm ${harvest.farmId}:`, error);
      harvest.status = HarvestStatus.FAILED;
      harvest.updatedAt = new Date();
      Object.assign(harvest, await this.updateHarvestInDb(harvest));
    }
  }

  /**
   * Collect files from workspace
   */
  private async collectWorkspaceFiles(workspacePath: string, harvest: HarvestData): Promise<HarvestArtifact[]> {
    const artifacts: HarvestArtifact[] = [];
    const MAX_INLINE_SIZE = 512 * 1024; // 512KB limit for inline content

    try {
      const files = await this.walkDirectory(workspacePath);

      for (const filePath of files) {
        if (this.shouldIgnoreFile(filePath)) continue;

        const stat = await fs.stat(filePath);
        const mimeType = this.getMimeType(filePath);
        const isTextFile = mimeType.startsWith('text/') ||
                          mimeType.includes('javascript') ||
                          mimeType.includes('typescript') ||
                          mimeType.includes('json') ||
                          mimeType.includes('xml') ||
                          mimeType.includes('yaml');

        let content: string | undefined;

        // Handle file content based on size and type
        if (stat.size > MAX_INLINE_SIZE) {
          // Large files: store reference with path, no inline content
          content = `[File too large for inline storage: ${this.formatBytes(stat.size)}. Available at: ${filePath}]`;
        } else if (isTextFile) {
          // Text files: read as UTF-8
          content = await fs.readFile(filePath, 'utf-8').catch(() => undefined);
        } else {
          // Binary files under limit: store as base64
          const buffer = await fs.readFile(filePath).catch(() => null);
          if (buffer) {
            content = `data:${mimeType};base64,${buffer.toString('base64')}`;
          }
        }

        artifacts.push({
          id: uuidv4(),
          harvestId: harvest.id,
          agentId: 'workspace',
          agentName: 'Workspace',
          type: this.getFileType(filePath),
          path: path.relative(workspacePath, filePath),
          content,
          size: stat.size,
          mimeType,
          createdAt: new Date()
        });
      }
    } catch (error) {
      logger.error(LogCategory.HARVEST, 'Failed to collect workspace files:', error);
    }

    return artifacts;
  }

  /**
   * Collect terminal outputs
   * CRITICAL FIX: Use correct terminal log paths and handle both Agent[] and string[] formats
   */
  private async collectTerminalOutputs(farm: Farm, harvest: HarvestData): Promise<HarvestArtifact[]> {
    const artifacts: HarvestArtifact[] = [];
    const farmId = farm.id;

    // Determine agent count - works whether agents is Agent[] or string[]
    const agentCount = Array.isArray(farm.agents) ? farm.agents.length : 0;

    // If no agents array, try to get agent count from config or default to checking existing logs
    const effectiveAgentCount = agentCount > 0 ? agentCount : (farm.config?.agentCount || 10);

    // CRITICAL FIX: Use pathConfig.getTerminalLogPath() which points to correct location
    // OLD (wrong): LOGS_DIR/terminals/{sessionName}_{agentIndex}.log
    // NEW (correct): TERMINALS_DIR/{farmId}/agent-{agentIndex}.log
    for (let agentIndex = 0; agentIndex < effectiveAgentCount; agentIndex++) {
      // Use the correct path from pathConfig
      const terminalPath = pathConfig.getTerminalLogPath(farmId, agentIndex);

      // Get agent info if available
      let agentId = `agent-${agentIndex}`;
      let agentName = `Agent ${agentIndex + 1}`;

      if (isAgentArray(farm.agents) && farm.agents[agentIndex]) {
        const agent = farm.agents[agentIndex];
        agentId = agent.id;
        agentName = agent.name;
      }

      try {
        const content = await fs.readFile(terminalPath, 'utf-8');

        // Only add if there's actual content
        if (content && content.trim().length > 0) {
          artifacts.push({
            id: uuidv4(),
            harvestId: harvest.id,
            agentId,
            agentName,
            type: 'terminal',
            path: `terminal/${agentName}.log`,
            content,
            size: Buffer.byteLength(content),
            mimeType: 'text/plain',
            createdAt: new Date()
          });

          logger.info(LogCategory.HARVEST,
            `Collected terminal log for ${agentName}: ${Buffer.byteLength(content)} bytes`);
        }
      } catch (error) {
        // Terminal log might not exist - this is normal for unused agent slots
        logger.debug(`No terminal log at ${terminalPath} for agent ${agentIndex}`);
      }
    }

    logger.info(LogCategory.HARVEST,
      `Collected ${artifacts.length} terminal logs for farm ${farmId}`);

    return artifacts;
  }

  /**
   * Process harvest (generate summary, insights, etc.)
   */
  private async processHarvest(harvest: HarvestData): Promise<void> {
    // HIGH PRIORITY FIX: Get farm for yield generation
    const farm = farmService.getFarm(harvest.farmId);

    // HIGH PRIORITY FIX: Generate yield items from artifacts if not already done
    if ((!harvest.yield || harvest.yield.length === 0) && farm) {
      harvest.yield = this.generateYieldFromArtifacts(harvest.artifacts, farm);
      logger.info(LogCategory.HARVEST, `Generated ${harvest.yield.length} yield items during harvest processing`);
    }

    // Generate summary from artifacts
    const summary = this.generateHarvestSummary(harvest);
    harvest.summary = summary;

    // Mark as completed
    harvest.status = HarvestStatus.COMPLETED;
    harvest.completedAt = new Date();
    harvest.updatedAt = new Date();

    const updated = await this.updateHarvestInDb(harvest);

    // Emit completion event
    this.emit('harvest:completed', updated);

    // CRITICAL: Use broadcastWithAck for guaranteed harvest:completed delivery
    // This ensures frontend receives harvest completion event even with WebSocket reconnections
    try {
      const ackResult = await unifiedWebSocketManager.broadcastWithAck(
        'harvest:completed',
        updated,
        {
          farmId: updated.farmId,
          retryAttempts: 3,
          timeout: 5000
        }
      );

      if (ackResult.success) {
        logger.info(LogCategory.HARVEST,
          `Harvest completed event delivered to ${ackResult.delivered} clients for harvest ${updated.id}`);
      } else {
        logger.warn(LogCategory.HARVEST,
          `Harvest completed partial delivery: ${ackResult.delivered} delivered, ${ackResult.failed} failed`);
      }
    } catch (broadcastError) {
      logger.error(LogCategory.HARVEST, `Failed to broadcast harvest:completed event:`, broadcastError);
      // Don't fail harvest completion if broadcast fails - harvest is already completed
    }
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

    const updated = await this.updateHarvestInDb(harvest);

    this.emit('harvest:completed', updated);

    // CRITICAL: Use broadcastWithAck for guaranteed harvest:completed delivery
    // This ensures frontend receives harvest completion event even with WebSocket reconnections
    try {
      const ackResult = await unifiedWebSocketManager.broadcastWithAck(
        'harvest:completed',
        updated,
        {
          farmId: updated.farmId,
          retryAttempts: 3,
          timeout: 5000
        }
      );

      if (ackResult.success) {
        logger.info(LogCategory.HARVEST,
          `Harvest completed event delivered to ${ackResult.delivered} clients for harvest ${updated.id}`);
      } else {
        logger.warn(LogCategory.HARVEST,
          `Harvest completed partial delivery: ${ackResult.delivered} delivered, ${ackResult.failed} failed`);
      }
    } catch (broadcastError) {
      logger.error(LogCategory.HARVEST, `Failed to broadcast harvest:completed event:`, broadcastError);
      // Don't fail harvest completion if broadcast fails - harvest is already completed
    }

    return updated;
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
   * Internal accessor used by system services (shutdown coordinator, barn service)
   * FIX: Now async and loads from database if not in cache to prevent stale data
   */
  public async getHarvestById(harvestId: string): Promise<HarvestData | null> {
    // First check cache
    const cached = this.harvests.get(harvestId);
    if (cached) {
      return cached;
    }

    // FIX: Load from database if not in cache
    // This prevents stale cache issues during harvest collection
    return this.loadHarvestFromDb(harvestId);
  }

  /**
   * Sync version for cases where DB lookup is not needed
   * @deprecated Use async getHarvestById instead
   */
  public getHarvestByIdSync(harvestId: string): HarvestData | undefined {
    return this.harvests.get(harvestId);
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
        const startDate = filter.startDate;
        harvests = harvests.filter(h => h.createdAt >= startDate);
      }
      if (filter.endDate) {
        const endDate = filter.endDate;
        harvests = harvests.filter(h => h.createdAt <= endDate);
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
    unifiedWebSocketManager.broadcast('harvest:deleted', { id: harvestId });

    return true;
  }

  /**
   * Handle farm completion
   */
  private async handleFarmCompleted(farm: Farm): Promise<void> {
    const harvest = await this.startHarvest(farm.id, farm.name, farm.createdBy || 'system');
    farm.harvestId = harvest.id;
  }

  /**
   * Handle farm failure
   */
  private async handleFarmFailed(farm: Farm): Promise<void> {
    // Still collect what we can from failed farms
    const harvest = await this.startHarvest(farm.id, farm.name, farm.createdBy || 'system');
    harvest.metadata.totalAgents = farm.agents.length;
    // Handle case where agents can be Agent[] or string[]
    if (farm.agents.length > 0 && typeof farm.agents[0] === 'object') {
      const agentObjects = farm.agents as Array<{ status?: string }>;
      harvest.metadata.completedAgents = agentObjects.filter(a => a.status === 'completed').length;
    } else {
      // Agents are strings (IDs only), can't determine completion status
      harvest.metadata.completedAgents = 0;
    }
  }

  /**
   * Update harvest in database
   */
  private async updateHarvestInDb(harvest: HarvestData): Promise<HarvestData> {
    try {
      // Validate and sanitize artifacts
      const artifactsData = harvest.artifacts ?? [];
      const artifactsValidation = validateJSON(artifactsData, 'harvest artifacts');
      if (!artifactsValidation.valid) {
        logger.error(LogCategory.HARVEST, 'Invalid artifacts JSON', {
          harvestId: harvest.id,
          error: artifactsValidation.error
        });
        // Sanitize instead of failing
        const sanitizedArtifacts = sanitizeJSONForDB(artifactsData);
        harvest.artifacts = sanitizedArtifacts;
      }

      // Validate and sanitize metadata
      const metadataData = harvest.metadata ?? {};
      const metadataValidation = validateJSON(metadataData, 'harvest metadata');
      if (!metadataValidation.valid) {
        logger.error(LogCategory.HARVEST, 'Invalid metadata JSON', {
          harvestId: harvest.id,
          error: metadataValidation.error
        });
        // Sanitize instead of failing
        const sanitizedMetadata = sanitizeJSONForDB(metadataData);
        harvest.metadata = sanitizedMetadata as any;
      }

      // Validate and sanitize summary
      let summaryValue = null;
      if (harvest.summary !== undefined && harvest.summary !== null) {
        if (typeof harvest.summary === 'string') {
          // Even strings must be valid JSON for JSONB column - wrap in object
          summaryValue = JSON.stringify({ text: harvest.summary });
        } else {
          const summaryValidation = validateJSON(harvest.summary, 'harvest summary');
          if (!summaryValidation.valid) {
            logger.error(LogCategory.HARVEST, 'Invalid summary JSON', {
              harvestId: harvest.id,
              error: summaryValidation.error
            });
            // Sanitize instead of failing
            summaryValue = JSON.stringify(sanitizeJSONForDB(harvest.summary));
          } else {
            summaryValue = JSON.stringify(harvest.summary);
          }
        }
      }

      // HIGH PRIORITY FIX: Validate and sanitize yield data before saving
      let yieldValue = null;
      if (harvest.yield && harvest.yield.length > 0) {
        const yieldValidation = validateJSON(harvest.yield, 'harvest yield');
        if (!yieldValidation.valid) {
          logger.warn(LogCategory.HARVEST, 'Invalid yield JSON, sanitizing', {
            harvestId: harvest.id,
            error: yieldValidation.error
          });
          yieldValue = JSON.stringify(sanitizeJSONForDB(harvest.yield));
        } else {
          yieldValue = JSON.stringify(harvest.yield);
        }
      }

      const result = await db.query(
        `UPDATE harvests
           SET status = $1,
               artifacts = $2,
               metadata = $3,
               summary = $4,
               yield = $5,
               updated_at = $6,
               completed_at = $7
         WHERE id = $8
         RETURNING *`,
        [
          harvest.status,
          JSON.stringify(harvest.artifacts ?? []),
          JSON.stringify(harvest.metadata ?? {}),
          summaryValue,
          yieldValue,
          harvest.updatedAt,
          harvest.completedAt ?? null,
          harvest.id
        ]
      );

      if (result.rows.length === 0) {
        return harvest;
      }

      const updatedHarvest = this.cacheHarvest(this.rowToHarvest(result.rows[0]));
      return updatedHarvest;
    } catch (error) {
      logger.error(LogCategory.HARVEST, 'Failed to update harvest in database', {
        harvestId: harvest.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      // Mark harvest as failed instead of crashing
      harvest.status = HarvestStatus.FAILED;

      // Try one more time with safe minimal data
      try {
        await db.query(
          `UPDATE harvests SET status = $1, updated_at = $2 WHERE id = $3`,
          [HarvestStatus.FAILED, new Date(), harvest.id]
        );
      } catch (fallbackError) {
        logger.error(LogCategory.HARVEST, 'Critical: Could not mark harvest as failed', {
          harvestId: harvest.id,
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown'
        });
      }

      throw error;
    }
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
   * Comprehensive list covering common development file types
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      // Web technologies
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.jsx': 'text/jsx',
      '.ts': 'application/typescript',
      '.tsx': 'text/tsx',
      '.vue': 'text/x-vue',
      '.svelte': 'text/x-svelte',

      // Data formats
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.csv': 'text/csv',
      '.toml': 'text/toml',

      // Documentation
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.rst': 'text/x-rst',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

      // Programming languages
      '.py': 'text/x-python',
      '.java': 'text/x-java',
      '.c': 'text/x-c',
      '.cpp': 'text/x-c++',
      '.h': 'text/x-c',
      '.hpp': 'text/x-c++',
      '.cs': 'text/x-csharp',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.rb': 'text/x-ruby',
      '.php': 'text/x-php',
      '.swift': 'text/x-swift',
      '.kt': 'text/x-kotlin',
      '.scala': 'text/x-scala',
      '.sh': 'application/x-sh',
      '.bash': 'application/x-sh',
      '.zsh': 'application/x-sh',
      '.sql': 'application/sql',

      // Images
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',

      // Archives
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',

      // Config files
      '.env': 'text/plain',
      '.gitignore': 'text/plain',
      '.dockerignore': 'text/plain',
      '.editorconfig': 'text/plain',
      '.prettierrc': 'application/json',
      '.eslintrc': 'application/json',

      // iOS/macOS specific
      '.plist': 'application/x-plist',
      '.storyboard': 'application/xml',
      '.xib': 'application/xml',
      '.xcconfig': 'text/plain',
      '.entitlements': 'application/xml',
      '.strings': 'text/plain',
      '.m': 'text/x-objective-c',
      '.mm': 'text/x-objective-c++',

      // Android specific
      '.gradle': 'text/x-gradle',
      '.aar': 'application/octet-stream',
      '.apk': 'application/vnd.android.package-archive'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * HIGH PRIORITY FIX: Generate yield items from collected artifacts
   * This transforms raw artifacts into meaningful yield items that can be:
   * - Displayed in the Barn UI
   * - Extracted as individual barn items
   * - Filtered and searched by type
   */
  private generateYieldFromArtifacts(artifacts: HarvestArtifact[], farm: Farm): any[] {
    const yieldItems: any[] = [];

    for (const artifact of artifacts) {
      // Skip very small files or empty content
      if (artifact.size < 10) continue;

      // Determine yield type based on artifact type and content
      const yieldType = this.mapArtifactToYieldType(artifact);

      // Calculate quality score based on content and metadata
      const qualityScore = this.calculateQualityScore(artifact);

      // Generate meaningful name and description
      const { name, description } = this.generateYieldNameAndDescription(artifact);

      yieldItems.push({
        id: uuidv4(),
        name,
        type: yieldType,
        description,
        content: artifact.content,
        size: artifact.size,
        mimeType: artifact.mimeType,
        qualityScore,
        createdAt: artifact.createdAt,
        metadata: {
          path: artifact.path,
          agentId: artifact.agentId,
          agentName: artifact.agentName,
          source: artifact.type,
          farmId: farm.id,
          farmName: farm.name,
          content: artifact.content // Include content in metadata for barn extraction
        }
      });
    }

    // Sort by quality score (highest first)
    yieldItems.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

    return yieldItems;
  }

  /**
   * Map artifact type to yield type for barn categorization
   */
  private mapArtifactToYieldType(artifact: HarvestArtifact): string {
    switch (artifact.type) {
      case 'code':
        return 'code';
      case 'document':
        return 'documentation';
      case 'data':
        return 'data';
      case 'terminal':
        return 'farm-output';
      case 'file':
      default:
        // Try to determine from mime type
        if (artifact.mimeType?.includes('javascript') ||
            artifact.mimeType?.includes('typescript') ||
            artifact.mimeType?.includes('python')) {
          return 'code';
        }
        if (artifact.mimeType?.includes('markdown') ||
            artifact.mimeType?.includes('text')) {
          return 'documentation';
        }
        if (artifact.mimeType?.includes('json') ||
            artifact.mimeType?.includes('yaml') ||
            artifact.mimeType?.includes('csv')) {
          return 'data';
        }
        return 'file';
    }
  }

  /**
   * Calculate quality score for a yield item (0.0 to 1.0)
   * Based on content characteristics and metadata
   */
  private calculateQualityScore(artifact: HarvestArtifact): number {
    let score = 0.5; // Base score

    // Size factor (larger files tend to be more substantial)
    if (artifact.size > 1000) score += 0.1;
    if (artifact.size > 5000) score += 0.1;
    if (artifact.size > 10000) score += 0.1;

    // Content-based scoring
    if (artifact.content) {
      const content = artifact.content;

      // Has meaningful content (not just whitespace)
      if (content.trim().length > 100) score += 0.1;

      // Code quality indicators
      if (artifact.type === 'code') {
        // Has functions/classes
        if (/function|class|const|def|async/.test(content)) score += 0.1;
        // Has comments/documentation
        if (/\/\/|\/\*|\*\/|#|"""/.test(content)) score += 0.05;
        // Has imports (structured code)
        if (/import|require|from/.test(content)) score += 0.05;
      }

      // Document quality indicators
      if (artifact.type === 'document') {
        // Has headers
        if (/^#+\s|<h[1-6]>/m.test(content)) score += 0.1;
        // Has structure (lists, paragraphs)
        if (/\n\n|\*\s|\-\s|[0-9]+\.\s/.test(content)) score += 0.05;
      }
    }

    // Cap at 1.0
    return Math.min(score, 1.0);
  }

  /**
   * Generate meaningful name and description for yield item
   */
  private generateYieldNameAndDescription(artifact: HarvestArtifact): { name: string; description: string } {
    const fileName = path.basename(artifact.path);
    const ext = path.extname(artifact.path);
    const dirPath = path.dirname(artifact.path);

    let name = fileName;
    let description = '';

    switch (artifact.type) {
      case 'code':
        name = fileName;
        description = `Source code file (${ext.replace('.', '').toUpperCase()}) from ${dirPath || 'workspace'}`;
        // Try to extract purpose from first comment or function name
        if (artifact.content) {
          const commentMatch = artifact.content.match(/\/\/\s*(.+)|\/\*+\s*(.+?)\s*\*+\/|#\s*(.+)|"""\s*(.+?)\s*"""/);
          if (commentMatch) {
            const comment = (commentMatch[1] || commentMatch[2] || commentMatch[3] || commentMatch[4]).trim();
            if (comment.length > 10 && comment.length < 200) {
              description = comment;
            }
          }
        }
        break;

      case 'document':
        name = fileName;
        description = `Documentation file from ${dirPath || 'workspace'}`;
        // Try to extract first heading or first paragraph
        if (artifact.content) {
          const headingMatch = artifact.content.match(/^#+\s+(.+)$/m);
          if (headingMatch) {
            name = headingMatch[1].trim();
            description = `Documentation: ${fileName}`;
          }
        }
        break;

      case 'terminal':
        name = `${artifact.agentName} Terminal Output`;
        description = `Terminal log output from agent ${artifact.agentName} (${this.formatBytes(artifact.size)})`;
        break;

      case 'data':
        name = fileName;
        description = `Data file (${artifact.mimeType?.split('/')[1] || ext}) from ${dirPath || 'workspace'}`;
        break;

      default:
        name = fileName;
        description = `File from ${dirPath || 'workspace'} (${this.formatBytes(artifact.size)})`;
    }

    return { name, description };
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
   * Collect harvest by harvestId only (used by ShutdownCoordinator)
   * This is a convenience method that finds the farmId from the harvest
   */
  public async collectHarvest(harvestId: string): Promise<HarvestData | undefined> {
    try {
      // Get the harvest
      let harvest = this.harvests.get(harvestId);

      if (!harvest) {
        // Try to load from database
        const dbResult = await db.query(
          'SELECT * FROM harvests WHERE id = $1',
          [harvestId]
        );

        if (dbResult.rows.length === 0) {
          logger.warn(LogCategory.HARVEST, `Harvest ${harvestId} not found for collection`);
          return undefined;
        }

        harvest = this.rowToHarvest(dbResult.rows[0]);
        this.harvests.set(harvestId, harvest);
      }

      // Call collectFiles with both farmId and harvestId
      await this.collectFiles(harvest.farmId, harvestId);

      // Return the updated harvest
      return this.harvests.get(harvestId);
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to collect harvest ${harvestId}:`, error);
      throw error;
    }
  }

  /**
   * Collect files for a farm (used by ShutdownCoordinator)
   */
  public async collectFiles(farmId: string, harvestId: string): Promise<void> {
    try {
      // Get the harvest
      const harvest = this.harvests.get(harvestId);
      if (!harvest) {
        logger.warn(LogCategory.HARVEST, `Harvest ${harvestId} not found for file collection`);
        return;
      }

      // Get farm
      const farm = await farmService.getFarm(farmId);
      if (!farm) {
        logger.warn(LogCategory.HARVEST, `Farm ${farmId} not found for file collection`);
        return;
      }

      // Get workspace path - don't fail if it doesn't exist, just collect what we can
      const workspacePath = getFarmWorkspacePath(farmId);
      let workspaceFiles: HarvestArtifact[] = [];
      let terminalOutputs: HarvestArtifact[] = [];

      // Collect workspace files if path exists
      if (workspacePath && existsSync(workspacePath)) {
        try {
          workspaceFiles = await this.collectWorkspaceFiles(workspacePath, harvest);
          logger.info(LogCategory.HARVEST, `Collected ${workspaceFiles.length} workspace files for farm ${farmId}`);
        } catch (wsError) {
          logger.warn(LogCategory.HARVEST, `Failed to collect workspace files for farm ${farmId}:`, wsError);
        }
      } else {
        logger.info(LogCategory.HARVEST, `No workspace directory found for farm ${farmId}, skipping workspace collection`);
      }

      // Always try to collect terminal outputs
      try {
        terminalOutputs = await this.collectTerminalOutputs(farm, harvest);
        logger.info(LogCategory.HARVEST, `Collected ${terminalOutputs.length} terminal outputs for farm ${farmId}`);
      } catch (termError) {
        logger.warn(LogCategory.HARVEST, `Failed to collect terminal outputs for farm ${farmId}:`, termError);
      }

      // Update harvest with collected artifacts
      harvest.artifacts = [...workspaceFiles, ...terminalOutputs];
      harvest.status = HarvestStatus.COMPLETED;
      harvest.completedAt = new Date();
      harvest.metadata = {
        ...harvest.metadata,
        totalFiles: harvest.artifacts.length,
        totalSize: harvest.artifacts.reduce((sum, a) => sum + (a.size || 0), 0),
        totalAgents: farm.agents?.length || 0,
        completedAgents: terminalOutputs.length
      };

      // HIGH PRIORITY FIX: Generate yield items from artifacts
      // This ensures barn service has yield items to extract into individual barn items
      harvest.yield = this.generateYieldFromArtifacts(harvest.artifacts, farm);

      logger.info(LogCategory.HARVEST, `Generated ${harvest.yield.length} yield items from ${harvest.artifacts.length} artifacts`);

      // Generate summary from artifacts
      harvest.summary = this.generateHarvestSummary(harvest);

      // Save to database
      const updated = await this.updateHarvestInDb(harvest);
      Object.assign(harvest, updated);

      logger.info(LogCategory.HARVEST, `Collected ${harvest.artifacts.length} files for harvest ${harvestId}`);

      // CRITICAL: Emit harvest:completed event to trigger barn storage
      this.emit('harvest:completed', harvest);

      // Broadcast to frontend
      try {
        await unifiedWebSocketManager.broadcastWithAck(
          'harvest:completed',
          harvest,
          {
            farmId: harvest.farmId,
            retryAttempts: 3,
            timeout: 5000
          }
        );
        logger.info(LogCategory.HARVEST, `Successfully broadcast harvest:completed for ${harvestId}`);
      } catch (broadcastError) {
        logger.warn(LogCategory.HARVEST, `Failed to broadcast harvest:completed for ${harvestId}:`, broadcastError);
      }
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to collect files for harvest ${harvestId}:`, error);
      throw error;
    }
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
        Object.assign(harvest, await this.updateHarvestInDb(harvest));
      }
    }
  }
}

// Export singleton instance and types
export const harvestService = UnifiedHarvestService.getInstance();
export const harvestFileCollector = harvestService; // Alias for compatibility
