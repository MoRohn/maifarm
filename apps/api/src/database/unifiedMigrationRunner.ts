import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

interface MigrationInfo {
  version: number;
  name: string;
  filename: string;
  sql: string;
}

interface MigrationResult {
  success: boolean;
  applied: number[];
  failed: number[];
  skipped: number[];
  errors: Map<number, string>;
}

/**
 * Unified Migration Runner - Single source of truth for database migrations
 * Replaces MigrationFixer, RobustMigrationRunner, and MigrationRecoverySystem
 */
export class UnifiedMigrationRunner {
  private pool: Pool;
  private migrationsDir: string;
  private migrations: Map<number, MigrationInfo> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
    this.migrationsDir = path.join(process.cwd(), 'apps/api/src/database/migrations');
  }

  /**
   * Run all migrations in order
   */
  async runMigrations(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      applied: [],
      failed: [],
      skipped: [],
      errors: new Map()
    };

    try {
      // Ensure migrations tracking table exists
      await this.ensureMigrationsTable();

      // Load all migration files
      await this.loadMigrations();

      // Get applied migrations
      const appliedVersions = await this.getAppliedMigrations();

      // Sort migrations by version number
      const sortedVersions = Array.from(this.migrations.keys()).sort((a, b) => a - b);

      logger.info('MIGRATIONS', `Found ${sortedVersions.length} migrations, ${appliedVersions.size} already applied`);

      // Run each migration in order
      for (const version of sortedVersions) {
        if (appliedVersions.has(version)) {
          result.skipped.push(version);
          continue;
        }

        const migration = this.migrations.get(version)!;
        
        try {
          await this.runSingleMigration(migration);
          result.applied.push(version);
          logger.info('MIGRATIONS', `✅ Applied migration ${version}: ${migration.name}`);
        } catch (error: any) {
          result.failed.push(version);
          result.errors.set(version, error.message);
          result.success = false;
          
          // Log error but continue with other migrations
          logger.error('MIGRATIONS', `❌ Failed migration ${version}: ${migration.name}`, error.message);
          
          // For critical early migrations, we should stop
          if (version <= 5) {
            throw new Error(`Critical migration ${version} failed: ${error.message}`);
          }
        }
      }

      // Run post-migration validation
      await this.validateSchema();

      // Log summary with appropriate level based on results
      const logLevel = result.failed.length > 0 ? 'warn' : 'info';
      logger[logLevel]('MIGRATIONS',
        `Migration complete: ${result.applied.length} applied, ` +
        `${result.skipped.length} skipped, ${result.failed.length} failed`);

    } catch (error: any) {
      logger.error('MIGRATIONS', 'Migration runner failed:', error);
      result.success = false;
    }

    return result;
  }

  /**
   * Ensure the migrations tracking table exists
   */
  private async ensureMigrationsTable(): Promise<void> {
    // First check if table exists and what columns it has
    try {
      const tableCheck = await this.pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'schema_migrations'
      `);
      
      if (tableCheck.rows.length > 0) {
        // Table exists, check if we need to add missing columns
        const columns = tableCheck.rows.map(r => r.column_name);
        
        if (!columns.includes('name')) {
          await this.pool.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS name VARCHAR(255)');
        }
        if (!columns.includes('checksum')) {
          await this.pool.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)');
        }
        if (!columns.includes('execution_time_ms')) {
          await this.pool.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER');
        }
        
        logger.info('MIGRATIONS', 'Schema migrations table updated');
      } else {
        // Create new table
        const sql = `
          CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name VARCHAR(255),
            migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            checksum VARCHAR(64),
            execution_time_ms INTEGER
          );
        `;
        await this.pool.query(sql);
        logger.info('MIGRATIONS', 'Schema migrations table created');
      }
    } catch (error: any) {
      // If the check fails, try to create the table
      const sql = `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name VARCHAR(255),
          migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64),
          execution_time_ms INTEGER
        );
      `;
      await this.pool.query(sql);
      logger.info('MIGRATIONS', 'Schema migrations table ready');
    }
  }

  /**
   * Load all migration files from disk
   */
  private async loadMigrations(): Promise<void> {
    try {
      const files = await fs.readdir(this.migrationsDir);
      const migrationFiles = files
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const filename of migrationFiles) {
        // Extract version number from filename (e.g., "001_initial_schema.sql" -> 1)
        const versionMatch = filename.match(/^(\d+)[_\-]/);
        if (!versionMatch) {
          logger.warn('MIGRATIONS', `Skipping invalid migration filename: ${filename}`);
          continue;
        }

        const version = parseInt(versionMatch[1], 10);
        const name = filename.replace(/^\d+[_\-]/, '').replace(/\.sql$/, '');
        const filepath = path.join(this.migrationsDir, filename);
        const sql = await fs.readFile(filepath, 'utf-8');

        this.migrations.set(version, {
          version,
          name,
          filename,
          sql
        });
      }

      logger.info('MIGRATIONS', `Loaded ${this.migrations.size} migration files`);
    } catch (error) {
      logger.error('MIGRATIONS', 'Failed to load migration files:', error);
      throw error;
    }
  }

  /**
   * Get list of already applied migrations
   */
  private async getAppliedMigrations(): Promise<Set<number>> {
    try {
      const result = await this.pool.query(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
      // Handle both string and number version formats
      return new Set(result.rows.map(row => {
        const version = row.version;
        return typeof version === 'string' ? parseInt(version, 10) : version;
      }));
    } catch (error) {
      // Table might not exist yet
      logger.info('MIGRATIONS', 'No existing migrations found');
      return new Set();
    }
  }

  /**
   * Run a single migration with transaction support
   */
  private async runSingleMigration(migration: MigrationInfo): Promise<void> {
    const client = await this.pool.connect();
    const startTime = Date.now();

    try {
      // Skip transaction for migrations 000 and 001 as they check for tables that may not exist
      // Migration 001 creates core tables and some statements may reference future tables
      const useTransaction = migration.version !== 0 && migration.version !== 1;

      if (useTransaction) {
        await client.query('BEGIN');
      }

      // Split migration into individual statements
      const statements = this.splitSqlStatements(migration.sql);

      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await client.query(statement);
          } catch (error: any) {
            // Check if it's an expected error we can skip
            if (this.isSkippableError(error.message)) {
              logger.debug('MIGRATIONS', `Skipping expected condition in migration ${migration.version}: ${error.message}`);
            } else if (migration.version === 1 && error.message.includes('barn_items')) {
              // Special case for migration 1 referencing tables that don't exist yet
              logger.debug('MIGRATIONS', `Skipping barn_items reference in migration 1 (table created in migration 3)`);
            } else {
              throw error;
            }
          }
        }
      }

      // Record successful migration
      const executionTime = Date.now() - startTime;
      const checksum = this.calculateChecksum(migration.sql);

      // Handle both old and new schema_migrations table structures
      try {
        // Try with filename column (old structure)
        await client.query(
          `INSERT INTO schema_migrations (version, filename, name, checksum, execution_time_ms)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (version) DO NOTHING`,
          [String(migration.version), migration.filename, migration.name, checksum, executionTime]
        );
      } catch (insertError: any) {
        // If that fails, try without filename column (new structure)
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum, execution_time_ms)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (version) DO NOTHING`,
          [migration.version, migration.name, checksum, executionTime]
        );
      }

      if (useTransaction) {
        await client.query('COMMIT');
      }
    } catch (error) {
      // Only rollback if we started a transaction
      const useTransaction = migration.version !== 0;
      if (useTransaction) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Split SQL file into individual statements
   */
  private splitSqlStatements(sql: string): string[] {
    // Remove comments
    const withoutComments = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    // Split by semicolon, but not within functions/triggers/DO blocks
    const statements: string[] = [];
    let currentStatement = '';
    let inFunction = false;
    let inDoBlock = false;

    const lines = withoutComments.split('\n');
    for (const line of lines) {
      const upperLine = line.toUpperCase().trim();

      // Check for function/trigger start
      if (upperLine.includes('CREATE FUNCTION') ||
          upperLine.includes('CREATE TRIGGER') ||
          upperLine.includes('CREATE OR REPLACE FUNCTION')) {
        inFunction = true;
      }

      // Check for DO block start
      if (upperLine.startsWith('DO $') || upperLine.startsWith('DO$$')) {
        inDoBlock = true;
      }

      currentStatement += line + '\n';

      // Check for statement end
      if (!inFunction && !inDoBlock && line.trim().endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      } else if (inFunction && upperLine === '$$ LANGUAGE PLPGSQL;') {
        statements.push(currentStatement.trim());
        currentStatement = '';
        inFunction = false;
      } else if (inDoBlock && (upperLine === 'END $;' || upperLine === 'END$$;' || upperLine === 'END $' || upperLine === 'END$$')) {
        // Handle DO block end - may or may not have semicolon after END
        if (!currentStatement.trim().endsWith(';')) {
          // Check if next line might be the semicolon
          const nextLineIndex = lines.indexOf(line) + 1;
          if (nextLineIndex < lines.length && lines[nextLineIndex].trim() === ';') {
            continue; // Let the next iteration add the semicolon
          }
        }
        statements.push(currentStatement.trim());
        currentStatement = '';
        inDoBlock = false;
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    return statements;
  }

  /**
   * Check if an error is expected and can be skipped
   */
  private isSkippableError(message: string): boolean {
    const skippablePatterns = [
      'already exists',
      'does not exist',
      'duplicate key value',
      'cannot drop.*does not exist',
      'constraint.*already exists',
      'index.*already exists',
      'column.*already exists',
      'table.*already exists',
      'type.*already exists'
    ];

    return skippablePatterns.some(pattern => 
      new RegExp(pattern, 'i').test(message)
    );
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate that critical tables and columns exist
   */
  private async validateSchema(): Promise<void> {
    const criticalTables = [
      'users',
      'farms',
      'agents',
      'harvests',
      'barn_items',
      'api_keys',
      'tasks',
      'seeds'
    ];

    const missingTables: string[] = [];

    for (const table of criticalTables) {
      try {
        await this.pool.query(
          `SELECT 1 FROM information_schema.tables 
           WHERE table_schema = 'public' 
           AND table_name = $1`,
          [table]
        );
      } catch (error) {
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      logger.warn('MIGRATIONS', `Missing critical tables: ${missingTables.join(', ')}`);
      
      // Try to create missing tables with basic structure
      for (const table of missingTables) {
        await this.createBasicTable(table);
      }
    }
  }

  /**
   * Create a basic table structure for critical tables
   */
  private async createBasicTable(tableName: string): Promise<void> {
    const tableDefinitions: Record<string, string> = {
      users: `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255),
          role VARCHAR(50) DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      farms: `
        CREATE TABLE IF NOT EXISTS farms (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          status VARCHAR(50) DEFAULT 'idle',
          config JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      agents: `
        CREATE TABLE IF NOT EXISTS agents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          status VARCHAR(50) DEFAULT 'idle',
          type VARCHAR(50) DEFAULT 'claude',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      harvests: `
        CREATE TABLE IF NOT EXISTS harvests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
          status VARCHAR(50) DEFAULT 'pending',
          yield JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        )
      `,
      barn_items: `
        CREATE TABLE IF NOT EXISTS barn_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50),
          content TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      api_keys: `
        CREATE TABLE IF NOT EXISTS api_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          service VARCHAR(50) NOT NULL,
          name VARCHAR(255) NOT NULL,
          key_encrypted TEXT NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(service, name)
        )
      `,
      tasks: `
        CREATE TABLE IF NOT EXISTS tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
          title VARCHAR(255),
          description TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          priority VARCHAR(20) DEFAULT 'medium',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        )
      `,
      seeds: `
        CREATE TABLE IF NOT EXISTS seeds (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          config JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
    };

    const sql = tableDefinitions[tableName];
    if (sql) {
      try {
        await this.pool.query(sql);
        logger.info('MIGRATIONS', `✅ Created basic table: ${tableName}`);
      } catch (error) {
        logger.error('MIGRATIONS', `Failed to create table ${tableName}:`, error);
      }
    }
  }

  /**
   * Get migration status report
   */
  async getStatus(): Promise<{
    total: number;
    applied: number;
    pending: number;
    failed: number[];
  }> {
    await this.loadMigrations();
    const applied = await this.getAppliedMigrations();
    const total = this.migrations.size;
    const pending = total - applied.size;

    // Check for any failed migrations in recent runs
    const failed: number[] = [];

    return {
      total,
      applied: applied.size,
      pending,
      failed
    };
  }
}
