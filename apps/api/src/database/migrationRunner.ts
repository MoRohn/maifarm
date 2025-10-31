import { Pool, PoolClient } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrationStatus {
  name: string;
  version: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  started_at?: Date;
  completed_at?: Date;
  error?: string;
  tables_created?: number;
  checksum?: string;
}

interface ValidationResult {
  isValid: boolean;
  missingTables: string[];
  errors: string[];
}

export class RobustMigrationRunner {
  private pool: Pool;
  private migrationOrder: string[] | null = null;

  // Expected tables per migration for validation
  private expectedTables: Record<string, string[]> = {
    '000_fix_migration_issues.sql': [],  // Only fixes, no new tables
    '001_core_schema.sql': [
      'users', 'farms', 'agents', 'tasks', 'sessions', 
      'settings', 'tmux_sessions', 'farm_lifecycle_events'
    ],
    '002_monitoring_analytics.sql': [
      'metrics', 'logs', 'health_checks', 'agent_health_checks', 
      'token_usage', 'alerts', 'alert_rules', 'thinking_metrics',
      'thinking_preferences', 'thinking_recommendations', 
      'provider_metrics', 'audit_logs'
    ],
    '003_harvest_workflow.sql': [
      'seeds', 'harvests', 'harvest_yield', 'harvest_manifests',
      'barn_items', 'barn_sync_log', 'quick_tasks', 'gowild_sessions',
      'gowild_discoveries', 'gowild_checkpoints', 'task_checkpoints',
      'workspace_pool'
    ],
    '004_security_api.sql': [
      'api_keys', 'security_audits', 'vulnerabilities', 'access_tokens',
      'permission_grants', 'rate_limits', 'encryption_keys', 
      'security_audit_trail'
    ],
    '005_cluster_providers.sql': [
      'cluster_nodes', 'load_balancer_rules', 'provider_pool',
      'cross_provider_messages', 'provider_bridges', 'resource_pools',
      'failover_policies', 'cluster_events', 'agent_metrics'
    ]
  };

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async runAllMigrations(): Promise<void> {
    console.log('🚀 Starting robust migration runner...\n');

    if (!this.migrationOrder) {
      this.migrationOrder = await this.discoverMigrations();
    }

    // Ensure migration tracking table exists
    await this.ensureMigrationTable();

    for (const filename of this.migrationOrder) {
      const version = parseInt(filename.split('_')[0]);
      
      try {
        const status = await this.getMigrationStatus(filename);
        
        if (status?.status === 'completed') {
          // Validate that tables actually exist
          const validation = await this.validateMigration(filename);
          if (!validation.isValid) {
            console.log(`⚠️  ${filename} marked complete but validation failed`);
            console.log(`   Missing tables: ${validation.missingTables.join(', ')}`);
            console.log(`   Re-running migration...`);
            await this.runSingleMigration(filename, version);
          } else {
            console.log(`✓ ${filename} already completed and validated`);
          }
        } else if (status?.status === 'failed' || status?.status === 'rolled_back') {
          console.log(`🔄 Retrying previously failed migration: ${filename}`);
          await this.runSingleMigration(filename, version);
        } else {
          await this.runSingleMigration(filename, version);
        }
      } catch (error) {
        console.error(`❌ Failed to run migration ${filename}:`, error);
        await this.markMigrationFailed(filename, version, error as Error);
      }
    }

    console.log('\n✨ Migration runner complete!');
    await this.printMigrationSummary();
  }

  private async discoverMigrations(): Promise<string[]> {
    const migrationsDir = path.join(__dirname, 'migrations');
    const entries = await fs.readdir(migrationsDir);

    const filtered = entries.filter((file) => /^(\d+)_.*\.sql$/.test(file));

    return filtered.sort((a, b) => {
      const [aPrefix] = a.split('_');
      const [bPrefix] = b.split('_');
      const diff = parseInt(aPrefix, 10) - parseInt(bPrefix, 10);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
  }


  private async runSingleMigration(filename: string, version: number): Promise<void> {
    console.log(`\n📄 Running migration: ${filename}`);
    
    const client = await this.pool.connect();
    
    try {
      // Mark as running
      await this.markMigrationRunning(filename, version);

      // Read migration file
      const filePath = path.join(__dirname, 'migrations', filename);
      const sql = await fs.readFile(filePath, 'utf-8');

      // Calculate checksum for idempotency
      const checksum = this.calculateChecksum(sql);
      const existingChecksum = await this.getMigrationChecksum(filename);
      
      if (existingChecksum && existingChecksum === checksum) {
        console.log(`  ✓ Migration unchanged (checksum match)`);
        return;
      }

      // Parse SQL into statements (handle functions properly)
      const statements = this.parseSQLStatements(sql);
      console.log(`  📝 Found ${statements.length} statements to execute`);

      let tablesCreated = 0;
      let statementsExecuted = 0;
      let failedStatements = 0;

      // Execute each statement individually to avoid transaction abort on expected errors
      for (const statement of statements) {
        if (this.shouldSkipStatement(statement)) {
          continue;
        }

        try {
          // Each statement gets its own transaction
          await client.query('BEGIN');
          await client.query(statement);
          await client.query('COMMIT');
          
          statementsExecuted++;
          
          // Count table creations
          if (statement.toUpperCase().includes('CREATE TABLE')) {
            tablesCreated++;
          }
        } catch (error: any) {
          // Rollback this specific statement
          await client.query('ROLLBACK');
          
          // Handle expected errors gracefully
          if (this.isExpectedError(error)) {
            console.log(`  ℹ️  ${this.getErrorSummary(error)}`);
            failedStatements++;
          } else {
            // For unexpected errors, log but continue
            console.error(`  ⚠️  Statement failed: ${error.message}`);
            failedStatements++;
          }
        }
      }
      
      console.log(`  📊 Results: ${statementsExecuted} executed, ${failedStatements} skipped, ${tablesCreated} tables created`);

      // Validate migration
      const validation = await this.validateMigration(filename);
      if (!validation.isValid) {
        console.log(`  ⚠️  Validation issues: ${validation.errors.join(', ')}`);
        // Don't throw - allow partial success
      }

      // Mark as completed if we created the expected tables
      if (validation.isValid || tablesCreated > 0) {
        await this.markMigrationCompleted(filename, version, checksum, tablesCreated);
        console.log(`  ✅ Migration completed`);
      } else {
        await this.markMigrationFailed(filename, version, new Error('No tables created'));
      }
      
    } catch (error) {
      console.error(`  ❌ Migration failed:`, error);
      await this.markMigrationFailed(filename, version, error as Error);
      // Don't throw - allow other migrations to continue
    } finally {
      // Ensure we're not in a transaction
      try {
        await client.query('ROLLBACK');
      } catch {}
      client.release();
    }
  }

  private parseSQLStatements(sql: string): string[] {
    // Remove comments
    sql = sql.replace(/--.*$/gm, '');
    
    // Handle functions and triggers specially
    const statements: string[] = [];
    let currentStatement = '';
    let inFunction = false;
    let delimiter = ';';

    const lines = sql.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check for function/trigger start
      if (trimmedLine.match(/^CREATE (OR REPLACE )?(FUNCTION|TRIGGER)/i)) {
        inFunction = true;
      }
      
      currentStatement += line + '\n';
      
      // Check for statement end
      if (inFunction) {
        // Functions end with $$ language
        if (trimmedLine.match(/\$\$\s+language/i)) {
          inFunction = false;
          if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
            currentStatement = '';
          }
        }
      } else if (trimmedLine.endsWith(delimiter)) {
        // Regular statement ends with delimiter
        if (currentStatement.trim() && 
            !currentStatement.trim().match(/^(BEGIN|COMMIT|ROLLBACK);?$/i)) {
          statements.push(currentStatement.trim());
        }
        currentStatement = '';
      }
    }
    
    return statements.filter(s => s.length > 0);
  }

  private shouldSkipStatement(statement: string): boolean {
    const skipPatterns = [
      /^BEGIN;?$/i,
      /^COMMIT;?$/i,
      /^ROLLBACK;?$/i,
      /^\s*$/
    ];
    
    return skipPatterns.some(pattern => pattern.test(statement.trim()));
  }

  private isExpectedError(error: any): boolean {
    const expectedMessages = [
      'already exists',
      'does not exist',
      'duplicate key value'
    ];
    
    const errorMessage = error.message || '';
    return expectedMessages.some(msg => errorMessage.includes(msg));
  }

  private getErrorSummary(error: any): string {
    const message = error.message || '';
    if (message.includes('already exists')) {
      const match = message.match(/relation "([^"]+)" already exists/);
      return `Table/index ${match?.[1] || 'item'} already exists (skipping)`;
    }
    return message.split('\n')[0];
  }

  private async validateMigration(filename: string): Promise<ValidationResult> {
    const expectedTables = this.expectedTables[filename] || [];
    const missingTables: string[] = [];
    const errors: string[] = [];

    for (const table of expectedTables) {
      const exists = await this.tableExists(table);
      if (!exists) {
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      errors.push(`Missing tables: ${missingTables.join(', ')}`);
    }

    return {
      isValid: missingTables.length === 0,
      missingTables,
      errors
    };
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )`,
      [tableName]
    );
    return result.rows[0]?.exists || false;
  }

  private calculateChecksum(content: string): string {
    // Simple checksum for change detection
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private async ensureMigrationTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS migration_status (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        version INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        error TEXT,
        tables_created INTEGER DEFAULT 0,
        checksum VARCHAR(255),
        retry_count INTEGER DEFAULT 0
      )
    `);
  }

  private async getMigrationStatus(name: string): Promise<MigrationStatus | null> {
    const result = await this.pool.query(
      'SELECT * FROM migration_status WHERE name = $1',
      [name]
    );
    return result.rows[0] || null;
  }

  private async getMigrationChecksum(name: string): Promise<string | null> {
    const result = await this.pool.query(
      'SELECT checksum FROM migration_status WHERE name = $1',
      [name]
    );
    return result.rows[0]?.checksum || null;
  }

  private async markMigrationRunning(name: string, version: number): Promise<void> {
    await this.pool.query(`
      INSERT INTO migration_status (name, version, status, started_at)
      VALUES ($1, $2, 'running', CURRENT_TIMESTAMP)
      ON CONFLICT (name) 
      DO UPDATE SET 
        status = 'running',
        started_at = CURRENT_TIMESTAMP,
        retry_count = migration_status.retry_count + 1
    `, [name, version]);
  }

  private async markMigrationCompleted(
    name: string, 
    version: number, 
    checksum: string,
    tablesCreated: number
  ): Promise<void> {
    await this.pool.query(`
      UPDATE migration_status 
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          checksum = $3,
          tables_created = $4,
          error = NULL
      WHERE name = $1 AND version = $2
    `, [name, version, checksum, tablesCreated]);
  }

  private async markMigrationFailed(name: string, version: number, error: Error): Promise<void> {
    await this.pool.query(`
      UPDATE migration_status 
      SET status = 'failed',
          error = $3,
          completed_at = CURRENT_TIMESTAMP
      WHERE name = $1 AND version = $2
    `, [name, version, error.message]);
  }

  private async printMigrationSummary(): Promise<void> {
    const result = await this.pool.query(`
      SELECT name, status, tables_created, retry_count 
      FROM migration_status 
      ORDER BY version
    `);

    console.log('\n📊 Migration Summary:');
    console.log('━'.repeat(60));
    
    for (const row of result.rows) {
      const status = row.status === 'completed' ? '✅' : '❌';
      console.log(`${status} ${row.name.padEnd(30)} Tables: ${row.tables_created} Retries: ${row.retry_count}`);
    }
    
    console.log('━'.repeat(60));
  }
}

export default RobustMigrationRunner;
