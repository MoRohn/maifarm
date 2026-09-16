import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';
import { withRecovery } from '../utils/errorRecovery';
import { pathConfig } from '../config/paths';
import { AsyncLock } from '../utils/AsyncLock';
import { yieldDetectionService } from './YieldDetectionService';

// Collection lock to prevent concurrent harvest collection on the same harvest
const harvestCollectionLock = new AsyncLock({ defaultTimeout: 60000 });

interface HarvestConfig {
  farmId: string;
  name?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface HarvestArtifact {
  id: string;
  type: 'code' | 'document' | 'data' | 'terminal' | 'file';
  source: 'workspace' | 'terminal' | 'system';
  path: string;
  name: string;
  content?: string;
  size?: number;
  createdAt?: Date;
  mimeType?: string;
  agentId?: string;
  agentName?: string;
  metadata?: Record<string, unknown>;
}

interface YieldItem {
  id: string;
  type: string;
  name: string;
  description: string;
  size?: number;
  mimeType?: string;
  createdAt: Date;
  content?: string;
  quality?: number;
  qualityScore?: number;
  metadata?: Record<string, unknown>;
}

interface CollectionProgress {
  phase: 'scanning' | 'collecting' | 'validating' | 'packaging' | 'finalizing';
  filesScanned: number;
  filesCollected: number;
  totalBytes: number;
  errors: string[];
  currentFile?: string;
}

type HarvestStatus = 'processing' | 'ready' | 'failed' | 'collecting' | 'completed';

interface Harvest {
  id: string;
  farmId: string;
  name: string;
  status: HarvestStatus;
  artifacts: HarvestArtifact[];
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
  progress?: CollectionProgress;
  yield: YieldItem[];
}

const normalizeStatus = (status: string | null | undefined): HarvestStatus => {
  if (!status) return 'processing';
  switch (status) {
    case 'completed':
      return 'ready';
    case 'collecting':
    case 'pending':
      return 'processing';
    default:
      return status as HarvestStatus;
  }
};

const CODE_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.rb', '.go', '.rs', '.cpp', '.c', '.h', '.cs']);
const DOCUMENT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.doc', '.docx', '.pdf', '.html', '.htm', '.rtf']);
const DATA_EXTENSIONS = new Set(['.json', '.csv', '.yaml', '.yml', '.xml']);

const determineArtifactType = (filePath: string): 'code' | 'document' | 'data' | 'file' => {
  const ext = path.extname(filePath).toLowerCase();
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  if (DATA_EXTENSIONS.has(ext)) return 'data';
  return 'file';
};

const determineMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.yaml': 'application/x-yaml',
    '.yml': 'application/x-yaml',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.rtf': 'application/rtf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

const mapArtifactTypeToYieldType = (type: string): 'file' | 'report' | 'code' | 'documentation' | 'data' | 'model' | 'farm-output' => {
  switch (type) {
    case 'code':
      return 'code';
    case 'document':
      return 'documentation';
    case 'data':
      return 'data';
    case 'terminal':
      return 'report';
    default:
      return 'file';
  }
};

const walkDirectory = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkDirectory(fullPath);
      files.push(...nested);
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

// CACHE FIX: Track cache entry timestamps for TTL-based expiration
interface CacheEntry {
  harvest: Harvest;
  cachedAt: number;
}

// Cache TTL: 30 seconds - prevents stale reads while allowing reasonable performance
const CACHE_TTL_MS = 30000;

class HarvestService {
  private static instance: HarvestService;
  private harvests = new Map<string, Harvest>();
  private cacheTimestamps = new Map<string, number>();

  private constructor() {
    // CACHE FIX: Periodic cache cleanup to prevent memory leaks
    setInterval(() => this.cleanupExpiredCache(), 60000);
  }

  // CACHE FIX: Invalidate cache entry for a specific harvest
  invalidateCache(harvestId: string): void {
    this.harvests.delete(harvestId);
    this.cacheTimestamps.delete(harvestId);
    logger.debug(LogCategory.HARVEST, `Cache invalidated for harvest ${harvestId}`);
  }

  // CACHE FIX: Check if cache entry is expired
  private isCacheExpired(harvestId: string): boolean {
    const cachedAt = this.cacheTimestamps.get(harvestId);
    if (!cachedAt) return true;
    return (Date.now() - cachedAt) > CACHE_TTL_MS;
  }

  // CACHE FIX: Clean up expired cache entries
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, timestamp] of this.cacheTimestamps.entries()) {
      if ((now - timestamp) > CACHE_TTL_MS * 2) { // Use 2x TTL for cleanup to be less aggressive
        this.harvests.delete(id);
        this.cacheTimestamps.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(LogCategory.HARVEST, `Cleaned up ${cleaned} expired cache entries`);
    }
  }

  // CACHE FIX: Update cache with timestamp
  private cacheHarvest(harvest: Harvest): void {
    this.harvests.set(harvest.id, harvest);
    this.cacheTimestamps.set(harvest.id, Date.now());
  }

  static getInstance(): HarvestService {
    if (!this.instance) {
      this.instance = new HarvestService();
    }
    return this.instance;
  }

  async startHarvest(config: HarvestConfig): Promise<Harvest> {
    // Validate farmId is provided
    if (!config.farmId) {
      logger.error(LogCategory.HARVEST, 'Cannot start harvest without farmId', { config });
      throw new Error('farmId is required to start harvest');
    }

    const harvest: Harvest = {
      id: uuidv4(),
      farmId: config.farmId,
      name: config.name || `Harvest-${Date.now()}`,
      status: 'processing',
      artifacts: [],
      yield: [],
      metadata: config.metadata || {},
      createdAt: new Date()
    };

    this.harvests.set(harvest.id, harvest);

    logger.info(LogCategory.HARVEST, `Started harvest ${harvest.id} for farm ${config.farmId}`);

    // Save to database with error recovery
    await withRecovery(
      async () => {
        await db.query(
          `INSERT INTO harvests (id, farm_id, name, status, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [harvest.id, harvest.farmId, harvest.name, harvest.status, JSON.stringify(harvest.metadata), harvest.createdAt]
        );
      },
      { operation: 'save-harvest', farmId: config.farmId },
      undefined // No fallback for insert
    ).catch(error => {
      logger.error(LogCategory.HARVEST, `Failed to save harvest to database:`, error);
    });

    // Emit WebSocket event with error recovery
    await withRecovery(
      async () => {
        const ackResult = await unifiedWebSocketManager.broadcastWithAck(
          'harvest:started',
          harvest,
          {
            farmId: config.farmId,
            retryAttempts: 3,
            timeout: 5000
          }
        );

        if (!ackResult.success) {
          logger.warn(LogCategory.HARVEST,
            `Partial delivery for harvest:started on ${config.farmId}: ${ackResult.delivered} delivered, ${ackResult.failed} failed`,
            { harvestId: harvest.id }
          );
        } else {
          logger.debug(LogCategory.HARVEST,
            `harvest:started delivered to ${ackResult.delivered} clients`,
            { harvestId: harvest.id, farmId: config.farmId }
          );
        }
      },
      { operation: 'emit-harvest-started', farmId: config.farmId },
      undefined // Continue even if websocket fails
    ).catch(error => {
      logger.warn(LogCategory.HARVEST, `Failed to emit harvest:started event:`, error);
    });

    return harvest;
  }

  /**
   * Update collection progress and broadcast to clients
   */
  async updateProgress(
    harvestId: string,
    progress: Partial<CollectionProgress>
  ): Promise<void> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest) {
      logger.warn(LogCategory.HARVEST, `Cannot update progress for unknown harvest ${harvestId}`);
      return;
    }

    // Initialize progress if not exists
    if (!harvest.progress) {
      harvest.progress = {
        phase: 'scanning',
        filesScanned: 0,
        filesCollected: 0,
        totalBytes: 0,
        errors: []
      };
    }

    // Update progress
    harvest.progress = {
      ...harvest.progress,
      ...progress
    };

    // Broadcast progress update
    websocketManager.emitToFarm(harvest.farmId, 'harvest:progress', {
      harvestId: harvest.id,
      farmId: harvest.farmId,
      progress: harvest.progress,
      timestamp: new Date().toISOString()
    });

    logger.debug(LogCategory.HARVEST,
      `Harvest ${harvestId} progress: ${harvest.progress.phase} - ${harvest.progress.filesCollected}/${harvest.progress.filesScanned} files`);
  }

  async completeHarvest(harvestId: string, artifacts?: HarvestArtifact[], yieldItems?: YieldItem[]): Promise<Harvest | undefined> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest) {
      logger.error(LogCategory.HARVEST, `Harvest ${harvestId} not found`);
      return undefined;
    }

    // IDEMPOTENCY GUARD: Prevent double-completion race conditions
    // If harvest is already completed or in a terminal state, return it as-is
    if (harvest.status === 'ready' || harvest.status === 'completed' || harvest.status === 'failed') {
      logger.warn(LogCategory.HARVEST,
        `Harvest ${harvestId} already in terminal state '${harvest.status}', skipping completion`,
        { completedAt: harvest.completedAt, artifactCount: harvest.artifacts?.length }
      );
      return harvest;
    }

    // Finalize progress
    if (harvest.progress) {
      await this.updateProgress(harvestId, {
        phase: 'finalizing',
        filesCollected: harvest.progress.filesScanned
      });
    }

    harvest.status = 'ready';
    harvest.completedAt = new Date();
    if (artifacts) {
      harvest.artifacts = artifacts;
    }
    if (yieldItems) {
      harvest.yield = yieldItems;
    }

    logger.info(LogCategory.HARVEST, `Completed harvest ${harvestId} with ${harvest.artifacts.length} artifacts and ${harvest.yield.length} yield items`);

    // ENHANCEMENT: Save yield items to harvest_yield table for discoverability
    if (harvest.yield && harvest.yield.length > 0) {
      await this.saveYieldItems(harvest);
    }

    // CRITICAL FIX: Link any real-time detected yield items to this harvest
    // This ensures yield items detected during farm execution are associated with the harvest
    try {
      await yieldDetectionService.linkYieldItemsToHarvest(harvest.farmId, harvestId);
      logger.info(LogCategory.HARVEST, `Linked real-time yield items to harvest ${harvestId}`);
    } catch (linkError) {
      logger.warn(LogCategory.HARVEST, `Failed to link yield items to harvest ${harvestId}:`, linkError);
      // Don't fail the harvest completion - yield linking is best effort
    }

    // Update database
    try {
      await db.query(
        `UPDATE harvests SET status = $1, completed_at = $2, artifacts = $3, yield_value = $4, file_count = $5, total_size = $6 WHERE id = $7`,
        [
          'completed',
          harvest.completedAt,
          JSON.stringify(harvest.artifacts),
          harvest.yield.length,
          harvest.artifacts.length,
          harvest.progress?.totalBytes || 0,
          harvestId
        ]
      );
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to update harvest in database:`, error);
    }

    // Emit completion event with final stats
    const payload = {
      id: harvest.id,
      farmId: harvest.farmId,
      name: harvest.name,
      status: harvest.status,
      artifactCount: harvest.artifacts.length,
      yieldCount: harvest.yield.length,
      totalBytes: harvest.progress?.totalBytes || 0,
      completedAt: harvest.completedAt,
      yield: harvest.yield || []
    };

    try {
      const ackResult = await unifiedWebSocketManager.broadcastWithAck(
        'harvest:completed',
        { harvest: payload },
        {
          farmId: harvest.farmId,
          retryAttempts: 3,
          timeout: 5000
        }
      );

      if (!ackResult.success) {
        logger.warn(LogCategory.HARVEST,
          `Partial delivery for harvest:completed on ${harvest.farmId}: ${ackResult.delivered} delivered, ${ackResult.failed} failed`,
          { harvestId: harvest.id }
        );
      } else {
        logger.info(LogCategory.HARVEST,
          `harvest:completed delivered to ${ackResult.delivered} clients`,
          { harvestId: harvest.id, farmId: harvest.farmId }
        );
      }
    } catch (error) {
      logger.error(LogCategory.HARVEST,
        `Failed to emit harvest:completed event for ${harvest.id}`,
        error
      );
    }
    websocketManager.emitToFarm(harvest.farmId, 'harvest:ready', {
      harvest: payload
    });
    websocketManager.emitToFarm(harvest.farmId, 'harvest:status', {
      harvestId: harvest.id,
      status: harvest.status,
      completedAt: harvest.completedAt
    });

    // NEW: Emit yield items ready event for UI
    websocketManager.emitToFarm(harvest.farmId, 'harvest:yield_ready', {
      harvestId: harvest.id,
      yieldCount: harvest.yield.length,
      yields: harvest.yield
    });

    return harvest;
  }

  /**
   * Save yield items to harvest_yield table for individual tracking and discoverability
   * ENHANCEMENT: Makes each yield item queryable and linkable to barn items
   */
  private async saveYieldItems(harvest: Harvest): Promise<void> {
    if (!harvest.yield || harvest.yield.length === 0) {
      return;
    }

    logger.info(LogCategory.HARVEST, `Saving ${harvest.yield.length} yield items to database for harvest ${harvest.id}`);

    try {
      for (const yieldItem of harvest.yield) {
        // Calculate quality score based on yield item characteristics
        const qualityScore = this.calculateQualityScore(yieldItem);

        await db.query(
          `INSERT INTO harvest_yield (
            id, harvest_id, farm_id, item_type, item_name, item_value, quality_score, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            item_value = EXCLUDED.item_value,
            quality_score = EXCLUDED.quality_score,
            metadata = EXCLUDED.metadata`,
          [
            yieldItem.id,
            harvest.id,
            harvest.farmId,
            yieldItem.type,
            yieldItem.name,
            JSON.stringify({
              description: yieldItem.description,
              size: yieldItem.size,
              mimeType: yieldItem.mimeType,
              createdAt: yieldItem.createdAt
            }),
            qualityScore,
            JSON.stringify(yieldItem.metadata || {})
          ]
        );
      }

      logger.info(LogCategory.HARVEST, `Successfully saved ${harvest.yield.length} yield items to harvest_yield table`);
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to save yield items to database:`, error);
    }
  }

  /**
   * Calculate quality score for a yield item based on multiple factors
   * Score range: 0.00 to 1.00
   */
  private calculateQualityScore(yieldItem: YieldItem): number {
    let score = 0.5; // Base score

    // Factor 1: Size (reasonable file size gets higher score)
    if (yieldItem.size) {
      if (yieldItem.size > 100 && yieldItem.size < 1000000) {
        score += 0.1; // Good size range
      } else if (yieldItem.size > 1000000) {
        score += 0.05; // Very large file
      } else if (yieldItem.size < 100) {
        score -= 0.05; // Very small file might be incomplete
      }
    }

    // Factor 2: Type (prefer code and documentation over generic files)
    const highValueTypes = ['code', 'documentation', 'data', 'model'];
    if (highValueTypes.includes(yieldItem.type)) {
      score += 0.15;
    }

    // Factor 3: Has description
    if (yieldItem.description && yieldItem.description.length > 10) {
      score += 0.1;
    }

    // Factor 4: Has metadata
    if (yieldItem.metadata && Object.keys(yieldItem.metadata).length > 2) {
      score += 0.1;
    }

    // Factor 5: Source (workspace files are more valuable than terminal output)
    if (yieldItem.metadata?.source === 'workspace') {
      score += 0.15;
    } else if (yieldItem.metadata?.source === 'system') {
      score -= 0.1; // System-generated might be less valuable
    }

    // Ensure score is within 0-1 range
    return Math.max(0, Math.min(1, score));
  }

  getHarvestById(harvestId: string): Harvest | undefined {
    return this.harvests.get(harvestId);
  }

  async collectHarvest(harvestId: string): Promise<Harvest | undefined> {
    const harvest = await this.getHarvest(harvestId);
    if (!harvest) {
      throw new Error(`Harvest ${harvestId} not found`);
    }

    if (harvest.status === 'ready') {
      return harvest;
    }

    // DISTRIBUTED LOCK: Prevent multiple concurrent collection attempts on the same harvest
    // This prevents race conditions where both farmRecoveryService and shutdownCoordinator
    // try to collect the same harvest simultaneously
    const lockKey = `harvest:collect:${harvestId}`;
    const releaseLock = await harvestCollectionLock.acquire(lockKey, harvestId);

    try {
      // CACHE FIX: Double-check status after acquiring lock using fresh DB read
      // This ensures we see any updates made by other processes while we were waiting for lock
      const currentHarvest = await this.getHarvestFresh(harvestId);
      if (currentHarvest?.status === 'ready' || currentHarvest?.status === 'completed') {
        logger.info(LogCategory.HARVEST,
          `Harvest ${harvestId} already completed by another process, skipping collection`);
        return currentHarvest;
      }

      let artifacts: HarvestArtifact[] = [];
    try {
      const [workspaceArtifacts, terminalArtifacts] = await Promise.all([
        this.collectWorkspaceArtifacts(harvest.farmId),
        this.collectTerminalArtifacts(harvest.farmId)
      ]);

      artifacts = [...workspaceArtifacts, ...terminalArtifacts];
      harvest.artifacts = artifacts;
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to collect artifacts for harvest ${harvestId}:`, error);
      // Continue with empty artifacts - summary will be generated below
      harvest.artifacts = [];
    }

    const yieldItems = artifacts.map(artifact => ({
      id: uuidv4(),
      type: mapArtifactTypeToYieldType(artifact.type),
      name: artifact.name,
      description: `Generated during ${harvest.name}`,
      size: artifact.size,
      mimeType: artifact.mimeType,
      createdAt: artifact.createdAt || new Date(),
      // Include content for barn storage
      content: artifact.content,
      contentEncoding: artifact.contentEncoding,
      metadata: {
        path: artifact.path,
        absolutePath: artifact.absolutePath, // Include absolute path for fallback
        source: artifact.source,
        agentId: artifact.agentId,
        agentName: artifact.agentName
      }
    }));

    // GUARANTEED YIELD: If no artifacts collected, create a summary yield item
    if (yieldItems.length === 0) {
      logger.warn(LogCategory.HARVEST,
        `No artifacts collected for harvest ${harvestId} - generating summary yield`);

      const summaryYield = await this.generateSummaryYield(harvest);
      yieldItems.push(summaryYield);

      // Also add summary as artifact
      artifacts.push({
        id: summaryYield.id,
        type: 'document',
        source: 'system',
        path: 'harvest-summary.md',
        name: 'Harvest Summary',
        size: summaryYield.size,
        createdAt: new Date(),
        mimeType: 'text/markdown',
        metadata: { systemGenerated: true }
      });
    }

      harvest.yield = yieldItems;

      return this.completeHarvest(harvestId, artifacts, yieldItems);
    } finally {
      // Always release the collection lock
      releaseLock();
    }
  }

  async failHarvest(harvestId: string, error: Error | unknown): Promise<Harvest | undefined> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest) {
      return undefined;
    }

    harvest.status = 'failed';
    harvest.completedAt = new Date();
    harvest.metadata = { ...harvest.metadata, error: (error as Error).message || String(error) };

    logger.error(LogCategory.HARVEST, `Failed harvest ${harvestId}:`, error);

    // Update database
    try {
      await db.query(
        `UPDATE harvests SET status = $1, completed_at = $2, metadata = $3 WHERE id = $4`,
        ['failed', harvest.completedAt, JSON.stringify(harvest.metadata), harvestId]
      );
    } catch (dbError) {
      logger.error(LogCategory.HARVEST, `Failed to update harvest in database:`, dbError);
    }

    // Emit WebSocket event
    websocketManager.emitToFarm(harvest.farmId, 'harvest:failed', { harvest, error });

    return harvest;
  }

  async getHarvest(harvestId: string): Promise<Harvest | undefined> {
    // CACHE FIX: Check if cache entry exists AND is not expired
    const cached = this.harvests.get(harvestId);
    if (cached && !this.isCacheExpired(harvestId)) {
      return cached;
    }

    // Try database - either no cache or cache expired
    try {
      const result = await db.query('SELECT * FROM harvests WHERE id = $1', [harvestId]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const harvest: Harvest = {
          id: row.id,
          farmId: row.farm_id,
          name: row.name,
          status: normalizeStatus(row.status),
          artifacts: row.artifacts || [],
          metadata: row.metadata || {},
          createdAt: row.created_at,
          completedAt: row.completed_at,
          yield: row.yield || []
        };
        // CACHE FIX: Use cacheHarvest to track timestamp
        this.cacheHarvest(harvest);
        return harvest;
      }
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to get harvest from database:`, error);
      // CACHE FIX: On DB error, return stale cache if available (better than nothing)
      if (cached) {
        logger.warn(LogCategory.HARVEST, `Returning stale cache for harvest ${harvestId} due to DB error`);
        return cached;
      }
    }

    return undefined;
  }

  // CACHE FIX: Force fetch from database bypassing cache (for critical operations)
  async getHarvestFresh(harvestId: string): Promise<Harvest | undefined> {
    this.invalidateCache(harvestId);
    return this.getHarvest(harvestId);
  }

  async getHarvestsByFarmId(farmId: string): Promise<Harvest[]> {
    try {
      const result = await db.query(
        'SELECT * FROM harvests WHERE farm_id = $1 ORDER BY created_at DESC',
        [farmId]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        farmId: row.farm_id,
        name: row.name,
        status: normalizeStatus(row.status),
        artifacts: row.artifacts || [],
        metadata: row.metadata || {},
        createdAt: row.created_at,
        completedAt: row.completed_at,
        yield: row.yield || []
      }));
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to get harvests for farm ${farmId}:`, error);
      return [];
    }
  }

  // Alias for getHarvestsByFarmId for backward compatibility
  async findByFarmId(farmId: string): Promise<Harvest[]> {
    return this.getHarvestsByFarmId(farmId);
  }

  // Alias for getHarvest for backward compatibility
  async findById(harvestId: string): Promise<Harvest | undefined> {
    return this.getHarvest(harvestId);
  }

  async getAllHarvests(): Promise<Harvest[]> {
    try {
      const result = await db.query('SELECT * FROM harvests ORDER BY created_at DESC');
      return result.rows.map((row: any) => ({
        id: row.id,
        farmId: row.farm_id,
        name: row.name,
        status: normalizeStatus(row.status),
        artifacts: row.artifacts || [],
        metadata: row.metadata || {},
        createdAt: row.created_at,
        completedAt: row.completed_at,
        yield: row.yield || []
      }));
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to get all harvests:`, error);
      return [];
    }
  }

  /**
   * Find all harvests with optional filtering
   * This method supports the harvest API filter parameters
   */
  async findAll(filter?: {
    farmId?: string;
    status?: string[];
    tags?: string[];
    qualityThreshold?: number;
    searchQuery?: string;
    dateRange?: { start: Date; end: Date };
  }): Promise<Harvest[]> {
    try {
      let query = 'SELECT * FROM harvests WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      // Apply filters if provided
      if (filter?.farmId) {
        query += ` AND farm_id = $${paramIndex++}`;
        params.push(filter.farmId);
      }

      if (filter?.status && filter.status.length > 0) {
        query += ` AND status = ANY($${paramIndex++})`;
        params.push(filter.status);
      }

      if (filter?.tags && filter.tags.length > 0) {
        query += ` AND tags && $${paramIndex++}`;
        params.push(filter.tags);
      }

      if (filter?.searchQuery) {
        query += ` AND (name ILIKE $${paramIndex} OR farm_name ILIKE $${paramIndex})`;
        params.push(`%${filter.searchQuery}%`);
        paramIndex++;
      }

      if (filter?.dateRange) {
        if (filter.dateRange.start) {
          query += ` AND created_at >= $${paramIndex++}`;
          params.push(filter.dateRange.start);
        }
        if (filter.dateRange.end) {
          query += ` AND created_at <= $${paramIndex++}`;
          params.push(filter.dateRange.end);
        }
      }

      query += ' ORDER BY created_at DESC LIMIT 100';

      const result = await db.query(query, params);
      return result.rows.map((row: any) => ({
        id: row.id,
        farmId: row.farm_id,
        farmName: row.farm_name,
        name: row.name,
        status: normalizeStatus(row.status),
        artifacts: row.artifacts || [],
        metadata: row.metadata || {},
        tags: row.tags || [],
        quality: row.quality,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        yield: row.yield || []
      }));
    } catch (error) {
      logger.error(LogCategory.HARVEST, 'Failed to find harvests with filter:', error);
      return [];
    }
  }

  /**
   * Get harvest summaries for dashboard display
   */
  async getSummaries(): Promise<{
    total: number;
    completed: number;
    pending: number;
    failed: number;
    recentHarvests: any[];
  }> {
    try {
      const statsResult = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status IN ('completed', 'ready') THEN 1 END) as completed,
          COUNT(CASE WHEN status IN ('pending', 'collecting') THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM harvests
      `);

      const recentResult = await db.query(`
        SELECT id, farm_id, farm_name, name, status, created_at, completed_at
        FROM harvests
        ORDER BY created_at DESC
        LIMIT 10
      `);

      const stats = statsResult.rows[0] || { total: 0, completed: 0, pending: 0, failed: 0 };
      const recentHarvests = recentResult.rows.map((row: any) => ({
        id: row.id,
        farmId: row.farm_id,
        farmName: row.farm_name,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at
      }));

      return {
        total: parseInt(stats.total) || 0,
        completed: parseInt(stats.completed) || 0,
        pending: parseInt(stats.pending) || 0,
        failed: parseInt(stats.failed) || 0,
        recentHarvests
      };
    } catch (error) {
      logger.error(LogCategory.HARVEST, 'Failed to get harvest summaries:', error);
      return {
        total: 0,
        completed: 0,
        pending: 0,
        failed: 0,
        recentHarvests: []
      };
    }
  }

  // Maximum file size to read content inline (512KB)
  private static readonly MAX_CONTENT_SIZE = 512 * 1024;

  private async collectWorkspaceArtifacts(farmId: string): Promise<any[]> {
    try {
      const workspacePath = pathConfig.getWorkspacePath(farmId);
      if (!workspacePath || !existsSync(workspacePath)) {
        return [];
      }

      const files = await walkDirectory(workspacePath);
      const artifacts = [] as any[];

      for (const filePath of files) {
        try {
          const stats = await fs.stat(filePath);
          const artifact: any = {
            id: uuidv4(),
            type: determineArtifactType(filePath),
            source: 'workspace',
            path: path.relative(workspacePath, filePath),
            absolutePath: filePath, // Store absolute path for barn storage
            name: path.basename(filePath),
            size: stats.size,
            createdAt: stats.mtime,
            mimeType: determineMimeType(filePath)
          };

          // Read file content for small files (under MAX_CONTENT_SIZE)
          // This ensures barn storage has the actual content
          if (stats.size <= HarvestService.MAX_CONTENT_SIZE) {
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              artifact.content = content;
              logger.debug(LogCategory.HARVEST, `Read content for artifact: ${artifact.path} (${stats.size} bytes)`);
            } catch (readError) {
              // File may be binary or unreadable, try as buffer
              try {
                const buffer = await fs.readFile(filePath);
                artifact.content = buffer.toString('base64');
                artifact.contentEncoding = 'base64';
                logger.debug(LogCategory.HARVEST, `Read binary content for artifact: ${artifact.path}`);
              } catch {
                logger.warn(LogCategory.HARVEST, `Could not read content for ${filePath}`, readError);
              }
            }
          } else {
            logger.info(LogCategory.HARVEST, `Artifact too large for inline content: ${artifact.path} (${stats.size} bytes)`);
          }

          artifacts.push(artifact);
        } catch (error) {
          logger.warn(LogCategory.HARVEST, `Failed to read workspace artifact ${filePath}:`, error);
        }
      }

      return artifacts;
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Workspace collection failed for farm ${farmId}:`, error);
      return [];
    }
  }

  private async collectTerminalArtifacts(farmId: string): Promise<any[]> {
    try {
      const terminalDir = pathConfig.getTerminalDir(farmId);
      if (!terminalDir || !existsSync(terminalDir)) {
        return [];
      }

      const files = await walkDirectory(terminalDir);
      const artifacts = [] as any[];

      for (const filePath of files) {
        try {
          const stats = await fs.stat(filePath);
          const artifact: any = {
            id: uuidv4(),
            type: 'terminal',
            source: 'terminal',
            path: path.relative(terminalDir, filePath),
            absolutePath: filePath, // Store absolute path for barn storage
            name: path.basename(filePath),
            size: stats.size,
            createdAt: stats.mtime,
            mimeType: 'text/plain'
          };

          // Read terminal log content (usually text files)
          if (stats.size <= HarvestService.MAX_CONTENT_SIZE) {
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              artifact.content = content;
              logger.debug(LogCategory.HARVEST, `Read terminal content for: ${artifact.path} (${stats.size} bytes)`);
            } catch (readError) {
              logger.warn(LogCategory.HARVEST, `Could not read terminal content for ${filePath}`, readError);
            }
          }

          artifacts.push(artifact);
        } catch (error) {
          logger.warn(LogCategory.HARVEST, `Failed to read terminal artifact ${filePath}:`, error);
        }
      }

      return artifacts;
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Terminal collection failed for farm ${farmId}:`, error);
      return [];
    }
  }

  /**
   * Generate a summary yield item when no artifacts are collected
   * Ensures users always receive harvest output explaining what happened
   */
  private async generateSummaryYield(harvest: Harvest): Promise<any> {
    const farmId = harvest.farmId;
    const workspacePath = pathConfig.getWorkspacePath(farmId);
    const terminalDir = pathConfig.getTerminalDir(farmId);

    // Check workspace and terminal directories
    const workspaceExists = workspacePath ? existsSync(workspacePath) : false;
    const terminalExists = terminalDir ? existsSync(terminalDir) : false;

    // Gather farm metadata from database
    let farmInfo = {
      name: 'Unknown',
      agentCount: 0,
      createdAt: new Date(),
      status: 'unknown'
    };

    try {
      const farmResult = await db.query(
        `SELECT name,
                jsonb_array_length(COALESCE(agents, '[]'::jsonb)) as agent_count,
                created_at,
                status
         FROM farms
         WHERE id = $1`,
        [farmId]
      );
      if (farmResult.rows.length > 0) {
        const row = farmResult.rows[0];
        farmInfo = {
          name: row.name,
          agentCount: row.agent_count || 0,
          createdAt: row.created_at,
          status: row.status
        };
      }
    } catch (error) {
      logger.warn(LogCategory.HARVEST, `Failed to fetch farm info for summary:`, error);
    }

    // Generate comprehensive summary markdown
    const summary = `# Harvest Summary

**Farm:** ${farmInfo.name}
**Harvest ID:** ${harvest.id}
**Created:** ${harvest.createdAt.toISOString()}
**Completed:** ${new Date().toISOString()}

## Status

This harvest completed successfully but did not produce any workspace or terminal artifacts.

## Possible Reasons

1. **Empty Workspace**: The farm workspace may not have been initialized or agents did not create any files
2. **Terminal Output Missing**: Terminal capture may not have been active during farm execution
3. **Quick Completion**: Farm may have completed too quickly for artifacts to be generated
4. **Error During Execution**: Agents may have encountered errors preventing output generation

## Farm Details

- **Agent Count:** ${farmInfo.agentCount}
- **Farm Status:** ${farmInfo.status}
- **Workspace Exists:** ${workspaceExists ? 'Yes' : 'No'}
- **Terminal Directory Exists:** ${terminalExists ? 'Yes' : 'No'}

## Recommendations

1. Check farm logs for any errors or warnings
2. Verify agents were launched successfully
3. Review terminal output in the UI for execution details
4. Consider increasing farm timeout if work was incomplete
5. Check workspace permissions and initialization

---

*This is an automatically generated summary when no harvest artifacts are found.*
`;

    const summaryBytes = Buffer.byteLength(summary, 'utf8');

    return {
      id: uuidv4(),
      type: 'documentation',
      name: 'Harvest Summary',
      description: 'System-generated summary for harvest with no artifacts',
      size: summaryBytes,
      mimeType: 'text/markdown',
      createdAt: new Date(),
      metadata: {
        path: 'harvest-summary.md',
        source: 'system',
        systemGenerated: true,
        farmId,
        farmName: farmInfo.name,
        agentCount: farmInfo.agentCount,
        workspaceExists,
        terminalExists,
        content: summary
      }
    };
  }
}

export const harvestService = HarvestService.getInstance();
export { HarvestService, Harvest, HarvestConfig };
