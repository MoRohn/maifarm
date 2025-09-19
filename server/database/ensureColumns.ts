import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface ColumnDefinition {
  table: string;
  column: string;
  type: string;
  defaultValue?: string;
  nullable?: boolean;
  createIndex?: boolean;
  foreignKey?: {
    table: string;
    column: string;
    onDelete?: string;
  };
}

/**
 * Ensures all required columns exist in database tables
 * This prevents "column does not exist" errors at runtime
 */
export class ColumnEnsurer {
  private pool: Pool;
  
  // Define all required columns that might be missing
  private requiredColumns: ColumnDefinition[] = [
    // barn_items columns
    {
      table: 'barn_items',
      column: 'farm_id',
      type: 'UUID',
      nullable: true,
      createIndex: true,
      foreignKey: {
        table: 'farms',
        column: 'id',
        onDelete: 'SET NULL'
      }
    },
    // farms columns
    {
      table: 'farms',
      column: 'metrics',
      type: 'JSONB',
      defaultValue: "'{}'",
      nullable: false,
      createIndex: true
    },
    // users columns
    {
      table: 'users',
      column: 'permissions',
      type: 'TEXT[]',
      defaultValue: "'{}'::TEXT[]",
      nullable: true
    },
    {
      table: 'users',
      column: 'mfa_secret',
      type: 'VARCHAR(255)',
      nullable: true
    },
    {
      table: 'users',
      column: 'mfa_enabled',
      type: 'BOOLEAN',
      defaultValue: 'FALSE',
      nullable: true
    },
    {
      table: 'users',
      column: 'last_login',
      type: 'TIMESTAMP',
      nullable: true
    },
    // agents columns
    {
      table: 'agents',
      column: 'thinking_level',
      type: 'VARCHAR(50)',
      nullable: true
    },
    {
      table: 'agents',
      column: 'thinking_auto_escalate',
      type: 'BOOLEAN',
      defaultValue: 'FALSE',
      nullable: true
    },
    {
      table: 'agents',
      column: 'thinking_complexity_score',
      type: 'INTEGER',
      nullable: true
    },
    // token_usage columns - add aliases for compatibility
    {
      table: 'token_usage',
      column: 'input_cost',
      type: 'DECIMAL(10, 6)',
      defaultValue: '0',
      nullable: true
    },
    {
      table: 'token_usage',
      column: 'output_cost',
      type: 'DECIMAL(10, 6)',
      defaultValue: '0',
      nullable: true
    },
    {
      table: 'token_usage',
      column: 'input_tokens',
      type: 'INTEGER',
      defaultValue: '0',
      nullable: true
    },
    {
      table: 'token_usage',
      column: 'output_tokens',
      type: 'INTEGER',
      defaultValue: '0',
      nullable: true
    },
    {
      table: 'token_usage',
      column: 'estimated_local_cost',
      type: 'DECIMAL(10, 6)',
      defaultValue: '0',
      nullable: true
    },
    {
      table: 'token_usage',
      column: 'currency',
      type: 'VARCHAR(10)',
      defaultValue: "'USD'",
      nullable: true
    },
    // gowild_sessions columns
    {
      table: 'gowild_sessions',
      column: 'metrics',
      type: 'JSONB',
      defaultValue: "'{}'",
      nullable: true
    },
    // farms columns - additional
    {
      table: 'farms',
      column: 'provider',
      type: 'VARCHAR(50)',
      defaultValue: "'claude'",
      nullable: true
    },
    {
      table: 'farms',
      column: 'orchestrator_type',
      type: 'VARCHAR(50)',
      defaultValue: "'standard'",
      nullable: true
    },
    {
      table: 'farms',
      column: 'tags',
      type: 'TEXT[]',
      defaultValue: "'{}'::TEXT[]",
      nullable: true
    },
    {
      table: 'farms',
      column: 'session_name',
      type: 'VARCHAR(255)',
      nullable: true
    },
    {
      table: 'farms',
      column: 'workspace_path',
      type: 'TEXT',
      nullable: true
    },
    {
      table: 'farms',
      column: 'source_seed_id',
      type: 'UUID',
      nullable: true,
      foreignKey: {
        table: 'seeds',
        column: 'id',
        onDelete: 'SET NULL'
      }
    },
    // agents columns - additional
    {
      table: 'agents',
      column: 'health_status',
      type: 'VARCHAR(50)',
      defaultValue: "'healthy'",
      nullable: true
    },
    // farms columns - lifecycle management
    {
      table: 'farms',
      column: 'deleted_at',
      type: 'TIMESTAMP',
      nullable: true
    },
    // gowild_discoveries columns - compatibility alias
    {
      table: 'gowild_discoveries',
      column: 'impact',
      type: 'VARCHAR(50)',
      defaultValue: "'medium'",
      nullable: true
    },
    // tasks columns - response time tracking
    {
      table: 'tasks',
      column: 'response_time',
      type: 'INTEGER',
      nullable: true
    },
    // tasks columns - timestamps
    {
      table: 'tasks',
      column: 'assigned_at',
      type: 'TIMESTAMP',
      nullable: true
    },
    {
      table: 'tasks',
      column: 'started_at',
      type: 'TIMESTAMP',
      nullable: true
    },
    {
      table: 'tasks',
      column: 'completed_at',
      type: 'TIMESTAMP',
      nullable: true
    }
  ];

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async ensureAllColumns(): Promise<void> {
    logger.info('[ColumnEnsurer] Checking and adding missing columns...');
    
    let addedColumns = 0;
    let errors = 0;

    for (const colDef of this.requiredColumns) {
      try {
        const added = await this.ensureColumn(colDef);
        if (added) {
          addedColumns++;
          logger.info(`[ColumnEnsurer] ✅ Added column ${colDef.table}.${colDef.column}`);
        }
      } catch (error) {
        errors++;
        logger.error(`[ColumnEnsurer] ❌ Failed to ensure column ${colDef.table}.${colDef.column}:`, error);
      }
    }

    logger.info(`[ColumnEnsurer] Complete: ${addedColumns} columns added, ${errors} errors`);
  }

  private async ensureColumn(colDef: ColumnDefinition): Promise<boolean> {
    // Check if table exists first
    const tableExists = await this.tableExists(colDef.table);
    if (!tableExists) {
      logger.warn(`[ColumnEnsurer] Table ${colDef.table} does not exist, skipping column ${colDef.column}`);
      return false;
    }

    // Check if column exists
    const columnExists = await this.columnExists(colDef.table, colDef.column);
    if (columnExists) {
      return false; // Column already exists
    }

    // Add the column
    await this.addColumn(colDef);
    
    // Add index if requested
    if (colDef.createIndex) {
      await this.createIndex(colDef.table, colDef.column);
    }
    
    // Add foreign key if specified
    if (colDef.foreignKey) {
      await this.addForeignKey(colDef);
    }

    return true;
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

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1 
        AND column_name = $2
      )`,
      [tableName, columnName]
    );
    return result.rows[0]?.exists || false;
  }

  private async addColumn(colDef: ColumnDefinition): Promise<void> {
    let sql = `ALTER TABLE ${colDef.table} ADD COLUMN ${colDef.column} ${colDef.type}`;
    
    if (colDef.defaultValue) {
      sql += ` DEFAULT ${colDef.defaultValue}`;
    }
    
    if (colDef.nullable === false) {
      sql += ' NOT NULL';
    }

    await this.pool.query(sql);
  }

  private async createIndex(tableName: string, columnName: string): Promise<void> {
    const indexName = `idx_${tableName}_${columnName}`;
    
    // Check if index already exists
    const indexExists = await this.pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = $1 
        AND indexname = $2
      )`,
      [tableName, indexName]
    );

    if (!indexExists.rows[0]?.exists) {
      // For JSONB columns, use GIN index
      const columnType = await this.getColumnType(tableName, columnName);
      const indexType = columnType === 'jsonb' ? 'USING gin' : '';
      
      await this.pool.query(
        `CREATE INDEX ${indexName} ON ${tableName} ${indexType} (${columnName})`
      );
    }
  }

  private async addForeignKey(colDef: ColumnDefinition): Promise<void> {
    if (!colDef.foreignKey) return;
    
    const constraintName = `${colDef.table}_${colDef.column}_fkey`;
    
    // Check if constraint already exists
    const constraintExists = await this.pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = $1 
        AND constraint_name = $2
      )`,
      [colDef.table, constraintName]
    );

    if (!constraintExists.rows[0]?.exists) {
      const onDelete = colDef.foreignKey.onDelete || 'SET NULL';
      await this.pool.query(
        `ALTER TABLE ${colDef.table} 
         ADD CONSTRAINT ${constraintName} 
         FOREIGN KEY (${colDef.column}) 
         REFERENCES ${colDef.foreignKey.table}(${colDef.foreignKey.column}) 
         ON DELETE ${onDelete}`
      );
    }
  }

  private async getColumnType(tableName: string, columnName: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public' 
       AND table_name = $1 
       AND column_name = $2`,
      [tableName, columnName]
    );
    return result.rows[0]?.data_type || 'unknown';
  }
}

export async function ensureRequiredColumns(pool: Pool): Promise<void> {
  const ensurer = new ColumnEnsurer(pool);
  await ensurer.ensureAllColumns();
}