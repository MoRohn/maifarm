import { Pool } from 'pg';
import { Repository } from '../../infrastructure/database/Repository';
import { Farm, FarmStatus } from './FarmService';
import { logger } from '../../utils/logger';

interface FarmRecord {
  id: string;
  name: string;
  description: string;
  status: FarmStatus;
  config: any;
  metrics: any;
  tags: string[];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  seed_id?: string;
}

interface FarmWithAgents extends FarmRecord {
  agents: any[];
}

/**
 * Repository for Farm domain entity
 * Implements farm-specific data access patterns
 */
export class FarmRepository extends Repository<FarmRecord> {
  constructor(pool: Pool) {
    super('farms', pool);
  }

  /**
   * Find farm with all its agents in a single query
   */
  async findWithAgents(farmId: string): Promise<FarmWithAgents | null> {
    try {
      const query = `
        SELECT 
          f.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', a.id,
                'name', a.name,
                'type', a.type,
                'status', a.status,
                'capabilities', a.capabilities,
                'resources', a.resources,
                'metrics', a.metrics,
                'last_heartbeat', a.last_heartbeat
              ) ORDER BY a.created_at
            ) FILTER (WHERE a.id IS NOT NULL),
            '[]'::json
          ) as agents
        FROM farms f
        LEFT JOIN agents a ON a.farm_id = f.id
        WHERE f.id = $1
        GROUP BY f.id
      `;

      const result = await this.query<FarmWithAgents>(query, [farmId]);
      return result[0] || null;
    } catch (error) {
      logger.error('[FarmRepository] Error finding farm with agents:', error);
      throw error;
    }
  }

  /**
   * Find all farms with their agents
   */
  async findAllWithAgents(
    criteria?: { status?: FarmStatus; created_by?: string },
    options?: { offset?: number; limit?: number }
  ): Promise<FarmWithAgents[]> {
    try {
      let query = `
        SELECT 
          f.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', a.id,
                'name', a.name,
                'type', a.type,
                'status', a.status,
                'capabilities', a.capabilities,
                'resources', a.resources,
                'metrics', a.metrics,
                'last_heartbeat', a.last_heartbeat
              ) ORDER BY a.created_at
            ) FILTER (WHERE a.id IS NOT NULL),
            '[]'::json
          ) as agents
        FROM farms f
        LEFT JOIN agents a ON a.farm_id = f.id
      `;

      const params: any[] = [];
      let paramIndex = 1;
      const conditions: string[] = [];

      if (criteria?.status) {
        conditions.push(`f.status = $${paramIndex++}`);
        params.push(criteria.status);
      }

      if (criteria?.created_by) {
        conditions.push(`f.created_by = $${paramIndex++}`);
        params.push(criteria.created_by);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' GROUP BY f.id ORDER BY f.created_at DESC';

      if (options?.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }

      if (options?.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(options.offset);
      }

      return this.query<FarmWithAgents>(query, params);
    } catch (error) {
      logger.error('[FarmRepository] Error finding all farms with agents:', error);
      throw error;
    }
  }

  /**
   * Find farms by status
   */
  async findByStatus(status: FarmStatus | FarmStatus[]): Promise<FarmRecord[]> {
    const statuses = Array.isArray(status) ? status : [status];
    const placeholders = statuses.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE status IN (${placeholders})
      ORDER BY created_at DESC
    `;
    
    return this.query<FarmRecord>(query, statuses);
  }

  /**
   * Find active farms (running, active, launching)
   */
  async findActiveFarms(): Promise<FarmRecord[]> {
    return this.findByStatus(['running', 'active', 'launching']);
  }

  /**
   * Update farm status
   */
  async updateStatus(farmId: string, status: FarmStatus): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
    
    const result = await this.pool.query(query, [status, farmId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update farm metrics
   */
  async updateMetrics(farmId: string, metrics: any): Promise<boolean> {
    const query = `
      UPDATE ${this.tableName}
      SET metrics = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;
    
    const result = await this.pool.query(query, [JSON.stringify(metrics), farmId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get farm statistics
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('running', 'active', 'launching')) as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM ${this.tableName}
    `;
    
    const result = await this.query<any>(query);
    return {
      total: parseInt(result[0].total, 10),
      active: parseInt(result[0].active, 10),
      completed: parseInt(result[0].completed, 10),
      failed: parseInt(result[0].failed, 10)
    };
  }

  /**
   * Find farms created in a time range
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<FarmRecord[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE created_at BETWEEN $1 AND $2
      ORDER BY created_at DESC
    `;
    
    return this.query<FarmRecord>(query, [startDate, endDate]);
  }

  /**
   * Find farms with specific tags
   */
  async findByTags(tags: string[]): Promise<FarmRecord[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE tags && $1
      ORDER BY created_at DESC
    `;
    
    return this.query<FarmRecord>(query, [tags]);
  }

  /**
   * Clean up old completed farms
   */
  async cleanupOldFarms(daysToKeep: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const query = `
      DELETE FROM ${this.tableName}
      WHERE status IN ('completed', 'failed', 'stopped')
      AND updated_at < $1
    `;
    
    const result = await this.pool.query(query, [cutoffDate]);
    return result.rowCount ?? 0;
  }

  /**
   * Get farms with timeout approaching
   */
  async findFarmsApproachingTimeout(thresholdMinutes: number = 5): Promise<FarmRecord[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE status IN ('running', 'active')
      AND config->>'timeout' IS NOT NULL
      AND EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) > 
          (CAST(config->>'timeout' AS INTEGER) - $1 * 60)
      ORDER BY created_at ASC
    `;
    
    return this.query<FarmRecord>(query, [thresholdMinutes]);
  }
}