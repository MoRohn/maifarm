/**
 * Unified Database Service
 * Consolidates all database operations and connection management
 */

import { Pool } from 'pg';
import { db } from '../../database/connection';
import { logger, LogCategory } from '../../utils/logger';
import { BaseService, DatabaseConnection, Farm, Agent, Harvest } from './types';

export class UnifiedDatabaseService implements BaseService {
  private pool: Pool;
  private isInitialized = false;
  private agentColumnsChecked = false;
  private agentSupportsSessionFields = true;

  constructor() {
    this.pool = db;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.isInitialized = true;
      logger.info(LogCategory.DATABASE, 'Database service initialized');
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to initialize database:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      await this.pool.end();
      this.isInitialized = false;
      logger.info(LogCategory.DATABASE, 'Database service shut down');
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Error during database shutdown:', error);
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return { healthy: true, message: 'Database connection healthy' };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }

  getStats(): Record<string, any> {
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingConnections: this.pool.waitingCount
    };
  }

  // Farm operations
  async saveFarm(farm: Farm): Promise<void> {
    const query = `
      INSERT INTO farms (id, name, description, config, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        config = EXCLUDED.config,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    `;

    await this.pool.query(query, [
      farm.id,
      farm.name,
      farm.description,
      JSON.stringify(farm.config),
      farm.status,
      farm.createdAt,
      farm.updatedAt
    ]);
  }

  async getFarm(farmId: string): Promise<Farm | null> {
    const query = 'SELECT * FROM farms WHERE id = $1';
    const result = await this.pool.query(query, [farmId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.rowToFarm(row);
  }

  async getAllFarms(): Promise<Farm[]> {
    const query = 'SELECT * FROM farms ORDER BY created_at DESC';
    const result = await this.pool.query(query);
    return result.rows.map(row => this.rowToFarm(row));
  }

  async updateFarm(farmId: string, updates: Partial<Farm>): Promise<void> {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) return;

    values.push(farmId);
    const query = `UPDATE farms SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
    await this.pool.query(query, values);
  }

  // Agent operations
  async saveAgent(agent: Agent): Promise<void> {
    await this.ensureAgentColumnSupport();

    if (this.agentSupportsSessionFields) {
      const extendedQuery = `
        INSERT INTO agents (id, farm_id, name, type, status, session_name, pane_index, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          session_name = EXCLUDED.session_name,
          pane_index = EXCLUDED.pane_index,
          updated_at = EXCLUDED.updated_at
      `;

      try {
        await this.pool.query(extendedQuery, [
          agent.id,
          agent.farmId,
          agent.name,
          agent.type,
          agent.status,
          agent.sessionName,
          agent.paneIndex,
          agent.createdAt,
          agent.updatedAt
        ]);
        return;
      } catch (error: any) {
        if (error?.code === '42703') {
          logger.warn(
            LogCategory.DATABASE,
            'Agents table missing session columns; switching to legacy schema compatibility'
          );
          this.agentSupportsSessionFields = false;
        } else {
          throw error;
        }
      }
    }

    const legacyQuery = `
      INSERT INTO agents (id, farm_id, name, type, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    `;

    await this.pool.query(legacyQuery, [
      agent.id,
      agent.farmId,
      agent.name,
      agent.type,
      agent.status,
      agent.createdAt,
      agent.updatedAt
    ]);
  }

  async getAgentsByFarmId(farmId: string): Promise<Agent[]> {
    const query = 'SELECT * FROM agents WHERE farm_id = $1';
    const result = await this.pool.query(query, [farmId]);
    return result.rows.map(row => this.rowToAgent(row));
  }

  // Harvest operations
  async saveHarvest(harvest: Harvest): Promise<void> {
    const query = `
      INSERT INTO harvests (id, farm_id, farm_name, status, files, summary, created_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.pool.query(query, [
      harvest.id,
      harvest.farmId,
      harvest.farmName,
      harvest.status,
      JSON.stringify(harvest.files),
      JSON.stringify(harvest.summary),
      harvest.createdAt,
      harvest.completedAt
    ]);
  }

  async getHarvest(harvestId: string): Promise<Harvest | null> {
    const query = 'SELECT * FROM harvests WHERE id = $1';
    const result = await this.pool.query(query, [harvestId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToHarvest(result.rows[0]);
  }

  // Helper methods
  private rowToFarm(row: any): Farm {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      status: row.status,
      agents: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mode: row.mode || 'farm',
      orchestrator: row.orchestrator || 'standard',
      timeout: row.timeout || 3600,
      sessionName: row.session_name,
      workspaceId: row.workspace_id,
      harvestId: row.harvest_id
    };
  }

  private rowToAgent(row: any): Agent {
    return {
      id: row.id,
      farmId: row.farm_id,
      name: row.name,
      type: row.type,
      status: row.status,
      sessionName:
        row.session_name || (row.farm_id ? `farm-${String(row.farm_id).substring(0, 8)}` : ''),
      paneIndex: typeof row.pane_index === 'number' ? row.pane_index : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastHeartbeat: row.last_heartbeat,
      metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
      error: row.error
    };
  }

  private async ensureAgentColumnSupport(): Promise<void> {
    if (this.agentColumnsChecked) {
      return;
    }

    try {
      const result = await this.pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'agents'
           AND table_schema = 'public'
           AND column_name IN ('session_name', 'pane_index')`
      );
      this.agentSupportsSessionFields = result.rows.length === 2;
    } catch (error) {
      logger.warn(LogCategory.DATABASE, 'Failed to inspect agents table schema:', error);
      this.agentSupportsSessionFields = false;
    } finally {
      this.agentColumnsChecked = true;
    }
  }

  private rowToHarvest(row: any): Harvest {
    return {
      id: row.id,
      farmId: row.farm_id,
      farmName: row.farm_name,
      status: row.status,
      files: JSON.parse(row.files || '[]'),
      summary: JSON.parse(row.summary || '{}'),
      createdAt: row.created_at,
      completedAt: row.completed_at
    };
  }
}
