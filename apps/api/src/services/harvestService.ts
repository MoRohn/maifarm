import { v4 as uuidv4 } from 'uuid';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { withRecovery, ensureProperties } from '../utils/errorRecovery';

interface HarvestConfig {
  farmId: string;
  name?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface Harvest {
  id: string;
  farmId: string;
  name: string;
  status: 'pending' | 'collecting' | 'completed' | 'failed';
  artifacts: any[];
  metrics?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date;
}

class HarvestService {
  private static instance: HarvestService;
  private harvests = new Map<string, Harvest>();

  private constructor() {}

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
      status: 'collecting',
      artifacts: [],
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
        websocketManager.emitToFarm(config.farmId, 'harvest:started', harvest);
      },
      { operation: 'emit-harvest-started', farmId: config.farmId },
      undefined // Continue even if websocket fails
    ).catch(error => {
      logger.warn(LogCategory.HARVEST, `Failed to emit harvest:started event:`, error);
    });

    return harvest;
  }

  async completeHarvest(harvestId: string, artifacts?: any[]): Promise<Harvest | undefined> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest) {
      logger.error(LogCategory.HARVEST, `Harvest ${harvestId} not found`);
      return undefined;
    }

    harvest.status = 'completed';
    harvest.completedAt = new Date();
    if (artifacts) {
      harvest.artifacts = artifacts;
    }

    logger.info(LogCategory.HARVEST, `Completed harvest ${harvestId}`);

    // Update database
    try {
      await db.query(
        `UPDATE harvests SET status = $1, completed_at = $2, artifacts = $3 WHERE id = $4`,
        ['completed', harvest.completedAt, JSON.stringify(harvest.artifacts), harvestId]
      );
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to update harvest in database:`, error);
    }

    // Emit WebSocket event
    websocketManager.emitToFarm(harvest.farmId, 'harvest:completed', harvest);

    return harvest;
  }

  async failHarvest(harvestId: string, error: any): Promise<Harvest | undefined> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest) {
      return undefined;
    }

    harvest.status = 'failed';
    harvest.completedAt = new Date();
    harvest.metadata = { ...harvest.metadata, error: error.message || String(error) };

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
    // Try memory first
    const cached = this.harvests.get(harvestId);
    if (cached) {
      return cached;
    }

    // Try database
    try {
      const result = await db.query('SELECT * FROM harvests WHERE id = $1', [harvestId]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const harvest: Harvest = {
          id: row.id,
          farmId: row.farm_id,
          name: row.name,
          status: row.status,
          artifacts: row.artifacts || [],
          metadata: row.metadata || {},
          createdAt: row.created_at,
          completedAt: row.completed_at
        };
        this.harvests.set(harvest.id, harvest);
        return harvest;
      }
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to get harvest from database:`, error);
    }

    return undefined;
  }

  async getHarvestsByFarmId(farmId: string): Promise<Harvest[]> {
    try {
      const result = await db.query(
        'SELECT * FROM harvests WHERE farm_id = $1 ORDER BY created_at DESC',
        [farmId]
      );

      return result.rows.map(row => ({
        id: row.id,
        farmId: row.farm_id,
        name: row.name,
        status: row.status,
        artifacts: row.artifacts || [],
        metadata: row.metadata || {},
        createdAt: row.created_at,
        completedAt: row.completed_at
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

  async getAllHarvests(): Promise<Harvest[]> {
    try {
      const result = await db.query('SELECT * FROM harvests ORDER BY created_at DESC');
      return result.rows.map(row => ({
        id: row.id,
        farmId: row.farm_id,
        name: row.name,
        status: row.status,
        artifacts: row.artifacts || [],
        metadata: row.metadata || {},
        createdAt: row.created_at,
        completedAt: row.completed_at
      }));
    } catch (error) {
      logger.error(LogCategory.HARVEST, `Failed to get all harvests:`, error);
      return [];
    }
  }
}

export const harvestService = HarvestService.getInstance();
export { HarvestService, Harvest, HarvestConfig };