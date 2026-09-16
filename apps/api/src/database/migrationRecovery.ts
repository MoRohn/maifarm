import { Pool } from 'pg';
import { RobustMigrationRunner } from './migrationRunner.js';
import MigrationFixer from './fixMigrations.js';

interface TableInfo {
  table_name: string;
  column_count: number;
  row_count: number;
  has_indexes: boolean;
  has_foreign_keys: boolean;
}

interface RecoveryReport {
  totalTables: number;
  missingTables: string[];
  corruptedTables: string[];
  fixedIssues: string[];
  recommendations: string[];
}

export class MigrationRecoverySystem {
  private pool: Pool;
  private allExpectedTables = [
    // Core tables (001)
    'users', 'farms', 'agents', 'tasks', 'sessions', 
    'settings', 'tmux_sessions', 'farm_lifecycle_events',
    
    // Monitoring tables (002)
    'metrics', 'logs', 'health_checks', 'agent_health_checks', 
    'token_usage', 'alerts', 'alert_rules', 'thinking_metrics',
    'thinking_preferences', 'thinking_recommendations', 
    'provider_metrics', 'audit_logs',
    
    // Harvest/Workflow tables (003)
    'seeds', 'harvests', 'harvest_yield', 'harvest_manifests',
    'barn_items', 'barn_sync_log', 'quick_tasks', 'gowild_sessions',
    'gowild_discoveries', 'gowild_checkpoints', 'task_checkpoints',
    'workspace_pool',
    
    // Security/API tables (004)
    'api_keys', 'security_audits', 'vulnerabilities', 'access_tokens',
    'permission_grants', 'rate_limits', 'encryption_keys', 
    'security_audit_trail',
    
    // Cluster/Provider tables (005)
    'cluster_nodes', 'load_balancer_rules', 'provider_pool',
    'cross_provider_messages', 'provider_bridges', 'resource_pools',
    'failover_policies', 'cluster_events', 'agent_metrics'
  ];

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async performFullRecovery(): Promise<RecoveryReport> {
    console.log('🔧 Starting Migration Recovery System...\n');
    
    const report: RecoveryReport = {
      totalTables: this.allExpectedTables.length,
      missingTables: [],
      corruptedTables: [],
      fixedIssues: [],
      recommendations: []
    };

    // Step 1: Diagnose current state
    console.log('📊 Step 1: Diagnosing database state...');
    await this.diagnoseDatabaseState(report);

    // Step 2: Fix migration files
    console.log('\n🔨 Step 2: Fixing migration files...');
    await this.fixMigrationFiles(report);

    // Step 3: Recover missing tables
    console.log('\n🏗️  Step 3: Recovering missing tables...');
    await this.recoverMissingTables(report);

    // Step 4: Validate foreign keys
    console.log('\n🔗 Step 4: Validating foreign key relationships...');
    await this.validateForeignKeys(report);

    // Step 5: Create missing indexes
    console.log('\n📇 Step 5: Ensuring indexes exist...');
    await this.ensureIndexes(report);

    // Step 6: Final validation
    console.log('\n✅ Step 6: Final validation...');
    await this.performFinalValidation(report);

    // Print report
    this.printRecoveryReport(report);

    return report;
  }

  private async diagnoseDatabaseState(report: RecoveryReport): Promise<void> {
    // Check which tables exist
    for (const tableName of this.allExpectedTables) {
      const exists = await this.tableExists(tableName);
      if (!exists) {
        report.missingTables.push(tableName);
      } else {
        // Check if table is healthy
        const isHealthy = await this.isTableHealthy(tableName);
        if (!isHealthy) {
          report.corruptedTables.push(tableName);
        }
      }
    }

    console.log(`  Found ${report.missingTables.length} missing tables`);
    console.log(`  Found ${report.corruptedTables.length} potentially corrupted tables`);

    if (report.missingTables.length > 0) {
      console.log(`  Missing: ${report.missingTables.slice(0, 5).join(', ')}${report.missingTables.length > 5 ? '...' : ''}`);
    }
  }

  private async fixMigrationFiles(report: RecoveryReport): Promise<void> {
    const fixer = new MigrationFixer();
    
    try {
      await fixer.fixMigrations();
      const isValid = await fixer.validateMigrations();
      
      if (isValid) {
        report.fixedIssues.push('Migration files standardized and validated');
        console.log('  ✅ Migration files fixed successfully');
      } else {
        report.recommendations.push('Manual review of migration files recommended');
        console.log('  ⚠️  Some migration issues remain, manual review recommended');
      }
    } catch (error) {
      console.error('  ❌ Error fixing migrations:', error);
      report.recommendations.push('Failed to fix migration files automatically');
    }
  }

  private async recoverMissingTables(report: RecoveryReport): Promise<void> {
    if (report.missingTables.length === 0) {
      console.log('  ✅ No missing tables to recover');
      return;
    }

    console.log(`  Attempting to recover ${report.missingTables.length} missing tables...`);
    
    // Run migrations with the robust runner
    const runner = new RobustMigrationRunner(this.pool);
    
    try {
      await runner.runAllMigrations();
      
      // Re-check missing tables
      const stillMissing: string[] = [];
      for (const tableName of report.missingTables) {
        if (!(await this.tableExists(tableName))) {
          stillMissing.push(tableName);
        } else {
          report.fixedIssues.push(`Recovered table: ${tableName}`);
        }
      }
      
      report.missingTables = stillMissing;
      
      if (stillMissing.length === 0) {
        console.log('  ✅ All missing tables recovered successfully');
      } else {
        console.log(`  ⚠️  ${stillMissing.length} tables still missing`);
        report.recommendations.push(`Manually create tables: ${stillMissing.join(', ')}`);
      }
      
    } catch (error) {
      console.error('  ❌ Error during table recovery:', error);
      report.recommendations.push('Migration runner encountered errors - manual intervention needed');
    }
  }

  private async validateForeignKeys(report: RecoveryReport): Promise<void> {
    const result = await this.pool.query(`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `);

    const brokenFKs: string[] = [];
    
    for (const fk of result.rows) {
      // Check if referenced table exists
      const exists = await this.tableExists(fk.foreign_table_name);
      if (!exists) {
        brokenFKs.push(`${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      }
    }

    if (brokenFKs.length > 0) {
      console.log(`  ⚠️  Found ${brokenFKs.length} broken foreign key relationships`);
      report.recommendations.push(`Fix foreign keys: ${brokenFKs.join(', ')}`);
    } else {
      console.log('  ✅ All foreign key relationships valid');
      report.fixedIssues.push('All foreign key relationships validated');
    }
  }

  private async ensureIndexes(report: RecoveryReport): Promise<void> {
    // Check for critical indexes
    const criticalIndexes = [
      { table: 'farms', column: 'status' },
      { table: 'agents', column: 'farm_id' },
      { table: 'tasks', column: 'farm_id' },
      { table: 'harvests', column: 'farm_id' },
      { table: 'token_usage', column: 'timestamp' },
      { table: 'metrics', column: 'timestamp' }
    ];

    let missingIndexes = 0;

    for (const index of criticalIndexes) {
      if (await this.tableExists(index.table)) {
        const hasIndex = await this.indexExists(index.table, index.column);
        if (!hasIndex) {
          missingIndexes++;
          // Try to create the index
          try {
            await this.pool.query(
              `CREATE INDEX IF NOT EXISTS idx_${index.table}_${index.column} 
               ON ${index.table}(${index.column})`
            );
            report.fixedIssues.push(`Created index on ${index.table}.${index.column}`);
          } catch (error) {
            console.error(`  Failed to create index on ${index.table}.${index.column}:`, error);
          }
        }
      }
    }

    if (missingIndexes === 0) {
      console.log('  ✅ All critical indexes present');
    } else {
      console.log(`  ✅ Created ${missingIndexes} missing indexes`);
    }
  }

  private async performFinalValidation(report: RecoveryReport): Promise<void> {
    // Count total tables
    const tableCount = await this.pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    const actualTables = parseInt(tableCount.rows[0].count);
    
    console.log(`  Total tables in database: ${actualTables}`);
    console.log(`  Expected tables: ${this.allExpectedTables.length}`);
    
    if (actualTables >= this.allExpectedTables.length) {
      console.log('  ✅ Database structure appears complete');
      report.fixedIssues.push('Database structure validated');
    } else {
      const missing = this.allExpectedTables.length - actualTables;
      console.log(`  ⚠️  Still missing ${missing} tables`);
    }

    // Test critical queries
    const testQueries = [
      { name: 'Farms query', query: 'SELECT COUNT(*) FROM farms' },
      { name: 'Agents query', query: 'SELECT COUNT(*) FROM agents' },
      { name: 'Tasks query', query: 'SELECT COUNT(*) FROM tasks' }
    ];

    for (const test of testQueries) {
      try {
        await this.pool.query(test.query);
        console.log(`  ✅ ${test.name} works`);
      } catch (error) {
        console.log(`  ❌ ${test.name} failed`);
        report.recommendations.push(`Fix table for: ${test.name}`);
      }
    }
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

  private async isTableHealthy(tableName: string): Promise<boolean> {
    try {
      // Validate table name against whitelist to prevent SQL injection
      const coreTables = ['farms', 'agents', 'harvests', 'seeds', 'users', 'api_keys',
                          'token_usage', 'metrics', 'tasks', 'barn_items', 'schema_migrations',
                          'gowild_sessions', 'health_checks', 'farm_lifecycle_events', 'security_audits'];
      if (!coreTables.includes(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
      }

      // Use identifier quoting for safety
      await this.pool.query(`SELECT 1 FROM "${tableName}" LIMIT 1`);

      // Check if it has columns
      const columns = await this.pool.query(
        `SELECT COUNT(*) as count
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
      );

      return parseInt(columns.rows[0].count) > 0;
    } catch {
      return false;
    }
  }

  private async indexExists(tableName: string, columnName: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = $1
        AND indexdef LIKE '%' || $2 || '%'
      )`,
      [tableName, columnName]
    );
    return result.rows[0]?.exists || false;
  }

  private printRecoveryReport(report: RecoveryReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('📋 RECOVERY REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Summary:`);
    console.log(`  Total Expected Tables: ${report.totalTables}`);
    console.log(`  Missing Tables: ${report.missingTables.length}`);
    console.log(`  Corrupted Tables: ${report.corruptedTables.length}`);
    console.log(`  Issues Fixed: ${report.fixedIssues.length}`);
    
    if (report.fixedIssues.length > 0) {
      console.log(`\n✅ Fixed Issues:`);
      report.fixedIssues.forEach(issue => console.log(`  - ${issue}`));
    }
    
    if (report.missingTables.length > 0) {
      console.log(`\n❌ Still Missing Tables:`);
      report.missingTables.forEach(table => console.log(`  - ${table}`));
    }
    
    if (report.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      report.recommendations.forEach(rec => console.log(`  - ${rec}`));
    }
    
    console.log('\n' + '='.repeat(60));
    
    const status = report.missingTables.length === 0 ? '✅ RECOVERY SUCCESSFUL' : '⚠️  MANUAL INTERVENTION NEEDED';
    console.log(status);
    console.log('='.repeat(60) + '\n');
  }
}

export default MigrationRecoverySystem;