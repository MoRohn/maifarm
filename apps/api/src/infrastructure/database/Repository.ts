import { Pool, QueryResult } from 'pg';
import { logger } from '../../utils/logger';

export interface QueryOptions {
  offset?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface Transaction {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Base Repository class implementing common database operations
 * Provides a clean abstraction over database access
 */
export abstract class Repository<T> {
  protected tableName: string;
  protected pool: Pool;

  constructor(tableName: string, pool: Pool) {
    this.tableName = tableName;
    this.pool = pool;
  }

  /**
   * Find a single record by ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      const result = await this.pool.query<T>(
        `SELECT * FROM ${this.tableName} WHERE id = $1`,
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`[Repository] Error finding ${this.tableName} by id:`, error);
      throw error;
    }
  }

  /**
   * Find all records matching criteria
   */
  async findAll(criteria?: Partial<T>, options?: QueryOptions): Promise<T[]> {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const params: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause
      if (criteria && Object.keys(criteria).length > 0) {
        const conditions = Object.entries(criteria).map(([key]) => {
          return `${key} = $${paramIndex++}`;
        });
        query += ` WHERE ${conditions.join(' AND ')}`;
        params.push(...Object.values(criteria));
      }

      // Add ordering
      if (options?.orderBy) {
        query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
      }

      // Add pagination
      if (options?.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }
      if (options?.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(options.offset);
      }

      const result = await this.pool.query<T>(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`[Repository] Error finding all ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find a single record matching criteria
   */
  async findOne(criteria: Partial<T>): Promise<T | null> {
    const results = await this.findAll(criteria, { limit: 1 });
    return results[0] || null;
  }

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`);

      const query = `
        INSERT INTO ${this.tableName} (${keys.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *
      `;

      const result = await this.pool.query<T>(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error(`[Repository] Error creating ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update a record by ID
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    try {
      const keys = Object.keys(data);
      const values = Object.values(data);
      
      if (keys.length === 0) {
        return this.findById(id);
      }

      const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
      
      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.pool.query<T>(query, [id, ...values]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`[Repository] Error updating ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `DELETE FROM ${this.tableName} WHERE id = $1`,
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error(`[Repository] Error deleting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Count records matching criteria
   */
  async count(criteria?: Partial<T>): Promise<number> {
    try {
      let query = `SELECT COUNT(*) FROM ${this.tableName}`;
      const params: any[] = [];
      let paramIndex = 1;

      if (criteria && Object.keys(criteria).length > 0) {
        const conditions = Object.entries(criteria).map(([key]) => {
          return `${key} = $${paramIndex++}`;
        });
        query += ` WHERE ${conditions.join(' AND ')}`;
        params.push(...Object.values(criteria));
      }

      const result = await this.pool.query<{ count: string }>(query, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error(`[Repository] Error counting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Check if a record exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const result = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE id = $1)`,
        [id]
      );
      return result.rows[0].exists;
    } catch (error) {
      logger.error(`[Repository] Error checking existence in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Execute a raw query
   */
  async query<R = T>(text: string, params?: any[]): Promise<R[]> {
    try {
      const result = await this.pool.query<R>(text, params);
      return result.rows;
    } catch (error) {
      logger.error('[Repository] Error executing query:', error);
      throw error;
    }
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<Transaction> {
    const client = await this.pool.connect();
    await client.query('BEGIN');

    return {
      query: async <R = any>(text: string, params?: any[]) => {
        return client.query<R>(text, params);
      },
      commit: async () => {
        await client.query('COMMIT');
        client.release();
      },
      rollback: async () => {
        await client.query('ROLLBACK');
        client.release();
      }
    };
  }

  /**
   * Execute multiple operations in a transaction
   */
  async executeInTransaction<R>(
    callback: (transaction: Transaction) => Promise<R>
  ): Promise<R> {
    const transaction = await this.beginTransaction();
    
    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Batch insert multiple records
   */
  async batchInsert(records: Partial<T>[]): Promise<T[]> {
    if (records.length === 0) return [];

    try {
      const keys = Object.keys(records[0]);
      const values: any[] = [];
      const placeholders: string[] = [];
      
      let paramIndex = 1;
      records.forEach((record) => {
        const recordPlaceholders = keys.map(() => `$${paramIndex++}`);
        placeholders.push(`(${recordPlaceholders.join(', ')})`);
        values.push(...keys.map(key => record[key as keyof T]));
      });

      const query = `
        INSERT INTO ${this.tableName} (${keys.join(', ')})
        VALUES ${placeholders.join(', ')}
        RETURNING *
      `;

      const result = await this.pool.query<T>(query, values);
      return result.rows;
    } catch (error) {
      logger.error(`[Repository] Error batch inserting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Soft delete (mark as deleted) if supported
   */
  async softDelete(id: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `UPDATE ${this.tableName} SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      // If column doesn't exist, fall back to hard delete
      if ((error as any).code === '42703') {
        return this.delete(id);
      }
      throw error;
    }
  }
}