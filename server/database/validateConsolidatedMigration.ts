import { Pool } from 'pg';
import { logger } from '../utils/logger';

/**
 * Validation script for the consolidated migration
 * Verifies that all expected tables, columns, indexes, and constraints exist
 */

interface ValidationResult {
  success: boolean;
  issues: string[];
  stats: {
    tablesFound: number;
    columnsFound: number;
    indexesFound: number;
    constraintsFound: number;
    triggersFound: number;
    functionsFound: number;
  };
}

interface TableColumn {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
}

export class ConsolidatedMigrationValidator {
  private pool: Pool;
  
  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Validate the consolidated migration
   */
  async validateMigration(): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: true,
      issues: [],
      stats: {
        tablesFound: 0,
        columnsFound: 0,
        indexesFound: 0,
        constraintsFound: 0,
        triggersFound: 0,
        functionsFound: 0
      }
    };

    try {
      logger.info('MIGRATION_VALIDATOR', 'Starting consolidated migration validation...');

      // Validate tables exist
      await this.validateTables(result);
      
      // Validate critical columns
      await this.validateCriticalColumns(result);
      
      // Validate foreign key constraints
      await this.validateForeignKeys(result);
      
      // Validate indexes
      await this.validateIndexes(result);
      
      // Validate triggers
      await this.validateTriggers(result);
      
      // Validate functions
      await this.validateFunctions(result);
      
      // Validate system user exists
      await this.validateSystemUser(result);
      
      // Validate migration tracking
      await this.validateMigrationTracking(result);

      logger.info('MIGRATION_VALIDATOR', `Validation complete: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      logger.info('MIGRATION_VALIDATOR', `Issues found: ${result.issues.length}`);

    } catch (error: any) {
      result.success = false;
      result.issues.push(`Validation error: ${error.message}`);
      logger.error('MIGRATION_VALIDATOR', 'Validation failed with error:', error);
    }

    return result;
  }

  /**
   * Validate that all expected tables exist
   */
  private async validateTables(result: ValidationResult): Promise<void> {
    const expectedTables = [
      // Core tables
      'users', 'farms', 'agents', 'tasks', 'sessions', 'settings',
      
      // Monitoring & Health
      'tmux_sessions', 'farm_lifecycle_events', 'session_health_log', 
      'session_crash_log', 'agent_health_checks', 'health_checks',
      
      // Analytics & Metrics
      'metrics', 'logs', 'token_usage', 'provider_metrics', 'audit_logs',
      
      // Alerts
      'alert_rules', 'alerts',
      
      // Harvest & Workflow
      'seeds', 'harvests', 'harvest_yield', 'harvest_manifests',
      'barn_items', 'barn_sync_log',
      
      // GoWild
      'gowild_sessions', 'gowild_discoveries', 'gowild_checkpoints',
      
      // Tasks
      'quick_tasks', 'task_checkpoints',
      
      // Workspace
      'workspace_pool',
      
      // Security
      'api_keys', 'security_audits',
      
      // Thinking
      'thinking_metrics', 'thinking_preferences', 'thinking_recommendations',
      
      // Migration tracking
      'schema_migrations'
    ];

    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const queryResult = await this.pool.query(query);
    const actualTables = queryResult.rows.map(row => row.table_name);
    
    result.stats.tablesFound = actualTables.length;

    // Check for missing tables
    for (const expectedTable of expectedTables) {
      if (!actualTables.includes(expectedTable)) {
        result.issues.push(`Missing table: ${expectedTable}`);
        result.success = false;
      }
    }

    logger.info('MIGRATION_VALIDATOR', `Tables validated: ${actualTables.length} found, ${expectedTables.length} expected`);
  }

  /**
   * Validate critical columns exist with correct types
   */
  private async validateCriticalColumns(result: ValidationResult): Promise<void> {
    const criticalColumns: TableColumn[] = [
      // Users table
      { tableName: 'users', columnName: 'id', dataType: 'uuid', isNullable: false, hasDefault: true },
      { tableName: 'users', columnName: 'email', dataType: 'character varying', isNullable: false, hasDefault: false },
      { tableName: 'users', columnName: 'roles', dataType: 'ARRAY', isNullable: true, hasDefault: true },
      
      // Farms table (including all migration fixes)
      { tableName: 'farms', columnName: 'id', dataType: 'uuid', isNullable: false, hasDefault: true },
      { tableName: 'farms', columnName: 'status', dataType: 'character varying', isNullable: false, hasDefault: true },
      { tableName: 'farms', columnName: 'last_heartbeat', dataType: 'timestamp without time zone', isNullable: true, hasDefault: false },
      { tableName: 'farms', columnName: 'last_health_check', dataType: 'timestamp without time zone', isNullable: true, hasDefault: false },
      { tableName: 'farms', columnName: 'crash_count', dataType: 'integer', isNullable: true, hasDefault: true },
      { tableName: 'farms', columnName: 'recovery_attempts', dataType: 'integer', isNullable: true, hasDefault: true },
      { tableName: 'farms', columnName: 'session_pid', dataType: 'integer', isNullable: true, hasDefault: false },
      
      // Token usage (with aliases from migration 024)
      { tableName: 'token_usage', columnName: 'prompt_tokens', dataType: 'integer', isNullable: false, hasDefault: true },
      { tableName: 'token_usage', columnName: 'input_tokens', dataType: 'integer', isNullable: true, hasDefault: true },
      { tableName: 'token_usage', columnName: 'output_tokens', dataType: 'integer', isNullable: true, hasDefault: true },
      { tableName: 'token_usage', columnName: 'currency', dataType: 'character varying', isNullable: true, hasDefault: true },
      
      // Harvests (with config and tags from recent migrations)
      { tableName: 'harvests', columnName: 'config', dataType: 'jsonb', isNullable: true, hasDefault: true },
      { tableName: 'harvests', columnName: 'tags', dataType: 'ARRAY', isNullable: true, hasDefault: true },
      
      // GoWild sessions (with metrics from migration 024)
      { tableName: 'gowild_sessions', columnName: 'metrics', dataType: 'jsonb', isNullable: true, hasDefault: true },
      
      // Barn sync log (with items_deleted from migration 029)
      { tableName: 'barn_sync_log', columnName: 'items_deleted', dataType: 'integer', isNullable: true, hasDefault: true }
    ];

    const query = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default IS NOT NULL as has_default
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `;

    const queryResult = await this.pool.query(query);
    const actualColumns = queryResult.rows;
    
    result.stats.columnsFound = actualColumns.length;

    // Check critical columns
    for (const expected of criticalColumns) {
      const actual = actualColumns.find(col => 
        col.table_name === expected.tableName && 
        col.column_name === expected.columnName
      );

      if (!actual) {
        result.issues.push(`Missing column: ${expected.tableName}.${expected.columnName}`);
        result.success = false;
      } else {
        // Validate data type (simplified check)
        if (!actual.data_type.includes(expected.dataType.toLowerCase())) {
          result.issues.push(
            `Column type mismatch: ${expected.tableName}.${expected.columnName} ` +
            `expected ${expected.dataType}, got ${actual.data_type}`
          );
          result.success = false;
        }
      }
    }

    logger.info('MIGRATION_VALIDATOR', `Columns validated: ${actualColumns.length} found`);
  }

  /**
   * Validate foreign key constraints exist
   */
  private async validateForeignKeys(result: ValidationResult): Promise<void> {
    const expectedForeignKeys = [
      'agents_farm_id_fkey',
      'tasks_farm_id_fkey', 
      'tasks_agent_id_fkey',
      'sessions_user_id_fkey',
      'tmux_sessions_farm_id_fkey',
      'farm_lifecycle_events_farm_id_fkey',
      'session_health_log_farm_id_fkey',
      'session_crash_log_farm_id_fkey',
      'token_usage_farm_id_fkey',
      'harvests_farm_id_fkey',
      'seeds_user_id_fkey',
      'farms_seed_id_fkey',
      'barn_items_user_id_fkey',
      'gowild_sessions_farm_id_fkey',
      'api_keys_user_id_fkey'
    ];

    const query = `
      SELECT constraint_name, table_name, column_name, foreign_table_name, foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY table_name
    `;

    const queryResult = await this.pool.query(query);
    const actualConstraints = queryResult.rows.map(row => row.constraint_name);
    
    result.stats.constraintsFound = actualConstraints.length;

    // Check for missing foreign keys
    for (const expectedFk of expectedForeignKeys) {
      if (!actualConstraints.includes(expectedFk)) {
        result.issues.push(`Missing foreign key constraint: ${expectedFk}`);
        result.success = false;
      }
    }

    logger.info('MIGRATION_VALIDATOR', `Foreign keys validated: ${actualConstraints.length} found`);
  }

  /**
   * Validate important indexes exist
   */
  private async validateIndexes(result: ValidationResult): Promise<void> {
    const expectedIndexes = [
      'idx_farms_status',
      'idx_farms_created_at', 
      'idx_farms_health_check',
      'idx_agents_farm_id',
      'idx_agents_status',
      'idx_token_usage_provider',
      'idx_token_usage_input_tokens',
      'idx_harvests_tags',
      'idx_logs_message_fulltext',
      'idx_gowild_sessions_metrics'
    ];

    const query = `
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY indexname
    `;

    const queryResult = await this.pool.query(query);
    const actualIndexes = queryResult.rows.map(row => row.indexname);
    
    result.stats.indexesFound = actualIndexes.length;

    // Check for missing indexes
    for (const expectedIndex of expectedIndexes) {
      if (!actualIndexes.includes(expectedIndex)) {
        result.issues.push(`Missing index: ${expectedIndex}`);
        result.success = false;
      }
    }

    logger.info('MIGRATION_VALIDATOR', `Indexes validated: ${actualIndexes.length} found`);
  }

  /**
   * Validate triggers exist
   */
  private async validateTriggers(result: ValidationResult): Promise<void> {
    const expectedTriggers = [
      'update_users_updated_at',
      'update_farms_updated_at',
      'update_agents_updated_at',
      'sync_token_usage_columns_trigger'
    ];

    const query = `
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
      ORDER BY trigger_name
    `;

    const queryResult = await this.pool.query(query);
    const actualTriggers = queryResult.rows.map(row => row.trigger_name);
    
    result.stats.triggersFound = actualTriggers.length;

    // Check for missing triggers
    for (const expectedTrigger of expectedTriggers) {
      if (!actualTriggers.includes(expectedTrigger)) {
        result.issues.push(`Missing trigger: ${expectedTrigger}`);
        result.success = false;
      }
    }

    logger.info('MIGRATION_VALIDATOR', `Triggers validated: ${actualTriggers.length} found`);
  }

  /**
   * Validate functions exist
   */
  private async validateFunctions(result: ValidationResult): Promise<void> {
    const expectedFunctions = [
      'update_updated_at_column',
      'sync_token_usage_columns',
      'get_farm_health_status'
    ];

    const query = `
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `;

    const queryResult = await this.pool.query(query);
    const actualFunctions = queryResult.rows.map(row => row.routine_name);
    
    result.stats.functionsFound = actualFunctions.length;

    // Check for missing functions
    for (const expectedFunction of expectedFunctions) {
      if (!actualFunctions.includes(expectedFunction)) {
        result.issues.push(`Missing function: ${expectedFunction}`);
        result.success = false;
      }
    }

    logger.info('MIGRATION_VALIDATOR', `Functions validated: ${actualFunctions.length} found`);
  }

  /**
   * Validate system user exists
   */
  private async validateSystemUser(result: ValidationResult): Promise<void> {
    const query = `
      SELECT id, username, email, roles 
      FROM users 
      WHERE id = '00000000-0000-0000-0000-000000000000'
    `;

    const queryResult = await this.pool.query(query);
    
    if (queryResult.rows.length === 0) {
      result.issues.push('System user does not exist');
      result.success = false;
    } else {
      const systemUser = queryResult.rows[0];
      if (systemUser.username !== 'system') {
        result.issues.push(`System user has incorrect username: ${systemUser.username}`);
        result.success = false;
      }
      if (!systemUser.roles.includes('system')) {
        result.issues.push('System user does not have system role');
        result.success = false;
      }
    }

    logger.info('MIGRATION_VALIDATOR', 'System user validated');
  }

  /**
   * Validate migration tracking
   */
  private async validateMigrationTracking(result: ValidationResult): Promise<void> {
    const query = `
      SELECT version, filename, success 
      FROM schema_migrations 
      WHERE version = '999'
      ORDER BY applied_at DESC
      LIMIT 1
    `;

    const queryResult = await this.pool.query(query);
    
    if (queryResult.rows.length === 0) {
      result.issues.push('Consolidated migration (999) not recorded in schema_migrations');
      result.success = false;
    } else {
      const migration = queryResult.rows[0];
      if (!migration.success) {
        result.issues.push('Consolidated migration marked as failed in schema_migrations');
        result.success = false;
      }
    }

    logger.info('MIGRATION_VALIDATOR', 'Migration tracking validated');
  }

  /**
   * Generate validation report
   */
  generateReport(result: ValidationResult): string {
    const report = [
      '====================================================',
      'CONSOLIDATED MIGRATION VALIDATION REPORT',
      '====================================================',
      '',
      `Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`,
      `Issues Found: ${result.issues.length}`,
      '',
      'Statistics:',
      `  Tables Found: ${result.stats.tablesFound}`,
      `  Columns Found: ${result.stats.columnsFound}`,
      `  Indexes Found: ${result.stats.indexesFound}`,
      `  Constraints Found: ${result.stats.constraintsFound}`,
      `  Triggers Found: ${result.stats.triggersFound}`,
      `  Functions Found: ${result.stats.functionsFound}`,
      ''
    ];

    if (result.issues.length > 0) {
      report.push('Issues:');
      result.issues.forEach(issue => {
        report.push(`  ❌ ${issue}`);
      });
      report.push('');
    }

    report.push('====================================================');
    
    return report.join('\n');
  }
}

/**
 * Standalone validation function for direct use
 */
export async function validateConsolidatedMigration(pool: Pool): Promise<ValidationResult> {
  const validator = new ConsolidatedMigrationValidator(pool);
  const result = await validator.validateMigration();
  
  const report = validator.generateReport(result);
  console.log(report);
  
  return result;
}

// Allow running this script directly
if (require.main === module) {
  const { Pool } = require('pg');
  
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'maifarm_dev',
    user: process.env.DB_USER || 'maifarm',
    password: process.env.DB_PASSWORD || 'maifarm123'
  });

  validateConsolidatedMigration(pool)
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    })
    .finally(() => {
      pool.end();
    });
}