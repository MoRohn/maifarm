#!/usr/bin/env node

import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.development') });

interface HealthCheckResult {
  table: string;
  exists: boolean;
  rowCount?: number;
  missingColumns?: string[];
  issues?: string[];
}

/**
 * Database Health Check Utility
 * Checks all tables and columns to ensure database is properly configured
 */
class DatabaseHealthChecker {
  private pool: Pool;
  
  // Define expected schema
  private expectedSchema: Record<string, string[]> = {
    users: ['id', 'email', 'username', 'password_hash', 'roles', 'permissions', 'mfa_secret', 'mfa_enabled', 'last_login', 'created_at', 'updated_at'],
    farms: ['id', 'name', 'description', 'status', 'provider', 'orchestrator_type', 'config', 'metrics', 'tags', 'tmux_session', 'session_name', 'workspace_path', 'created_by', 'seed_id', 'source_seed_id'],
    agents: ['id', 'farm_id', 'name', 'type', 'status', 'capabilities', 'resources', 'metrics', 'config', 'last_heartbeat', 'health_status', 'thinking_level', 'thinking_auto_escalate', 'thinking_complexity_score'],
    tasks: ['id', 'farm_id', 'agent_id', 'type', 'priority', 'status', 'payload', 'result', 'error', 'metadata', 'dependencies', 'retries', 'max_retries', 'timeout', 'response_time', 'assigned_at', 'started_at', 'completed_at'],
    barn_items: ['id', 'user_id', 'harvest_id', 'farm_id', 'name', 'description', 'category', 'type', 'data', 'metadata', 'tags', 'file_path', 'file_size', 'file_count', 'mime_type', 'sync_status'],
    harvests: ['id', 'farm_id', 'created_by', 'type', 'category', 'status', 'data', 'summary', 'results', 'insights', 'quality', 'metadata', 'file_count', 'total_size'],
    seeds: ['id', 'user_id', 'name', 'description', 'category', 'config', 'yaml_content', 'yaml_metadata', 'additional_prompt', 'source_type', 'source_seed_id', 'harvest_id'],
    api_keys: ['id', 'user_id', 'name', 'service', 'key_encrypted', 'key_hash', 'permissions', 'rate_limit', 'usage_count', 'last_used', 'is_active'],
    token_usage: ['id', 'provider', 'model', 'farm_id', 'agent_id', 'task_id', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cost', 'completion_cost', 'total_cost', 'input_tokens', 'output_tokens', 'input_cost', 'output_cost', 'estimated_local_cost', 'currency'],
    gowild_sessions: ['id', 'farm_id', 'config', 'boundaries', 'focus_areas', 'status', 'phase', 'exploration_depth', 'creativity_level', 'discoveries_count', 'checkpoints_count', 'rollbacks_count', 'summary', 'insights', 'metrics'],
    metrics: ['id', 'source', 'source_id', 'type', 'name', 'value', 'unit', 'labels', 'timestamp'],
    health_checks: ['id', 'service', 'status', 'details', 'response_time', 'timestamp']
  };

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'maifarm_dev',
      user: process.env.DB_USER || 'maifarm',
      password: process.env.DB_PASSWORD || 'maifarm123',
      max: 5
    });
  }

  async checkHealth(): Promise<void> {
    console.log('🏥 DATABASE HEALTH CHECK');
    console.log('='.repeat(60));
    
    const results: HealthCheckResult[] = [];
    let totalIssues = 0;

    // Check each table
    for (const [tableName, expectedColumns] of Object.entries(this.expectedSchema)) {
      const result = await this.checkTable(tableName, expectedColumns);
      results.push(result);
      
      if (!result.exists || result.missingColumns?.length || result.issues?.length) {
        totalIssues++;
      }
    }

    // Print results
    this.printResults(results);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    if (totalIssues === 0) {
      console.log('✅ DATABASE HEALTH: EXCELLENT');
      console.log('All tables and columns are present and accessible.');
    } else {
      console.log(`⚠️  DATABASE HEALTH: ${totalIssues} ISSUES FOUND`);
      console.log('Run "npm run db:fix" to attempt automatic fixes.');
    }
    console.log('='.repeat(60));
    
    await this.pool.end();
    process.exit(totalIssues > 0 ? 1 : 0);
  }

  private async checkTable(tableName: string, expectedColumns: string[]): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      table: tableName,
      exists: false,
      missingColumns: [],
      issues: []
    };

    try {
      // Check if table exists
      const tableExists = await this.tableExists(tableName);
      result.exists = tableExists;

      if (!tableExists) {
        result.issues?.push('Table does not exist');
        return result;
      }

      // Get row count
      try {
        const countResult = await this.pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        result.rowCount = parseInt(countResult.rows[0].count);
      } catch (error) {
        result.issues?.push('Cannot query table');
      }

      // Check columns
      const existingColumns = await this.getTableColumns(tableName);
      for (const column of expectedColumns) {
        if (!existingColumns.includes(column)) {
          result.missingColumns?.push(column);
        }
      }

    } catch (error: any) {
      result.issues?.push(error.message);
    }

    return result;
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

  private async getTableColumns(tableName: string): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_schema = 'public' 
       AND table_name = $1`,
      [tableName]
    );
    return result.rows.map(row => row.column_name);
  }

  private printResults(results: HealthCheckResult[]): void {
    console.log('\n📊 Table Status:');
    console.log('-'.repeat(60));
    
    for (const result of results) {
      const status = result.exists ? '✅' : '❌';
      const rowInfo = result.exists ? ` (${result.rowCount} rows)` : '';
      console.log(`${status} ${result.table.padEnd(20)} ${rowInfo}`);
      
      if (result.missingColumns?.length) {
        console.log(`   ⚠️  Missing columns: ${result.missingColumns.join(', ')}`);
      }
      
      if (result.issues?.length) {
        for (const issue of result.issues) {
          console.log(`   ❌ ${issue}`);
        }
      }
    }
  }

  async quickFix(): Promise<void> {
    console.log('\n🔧 Attempting quick fixes...');
    
    // Run the column ensurer
    const { ensureRequiredColumns } = await import('./ensureColumns');
    await ensureRequiredColumns(this.pool);
    
    console.log('✅ Quick fixes applied. Re-run health check to verify.');
  }
}

// Run health check
const checker = new DatabaseHealthChecker();

const command = process.argv[2];
if (command === '--fix') {
  checker.quickFix()
    .then(() => checker.checkHealth())
    .catch(console.error);
} else {
  checker.checkHealth().catch(console.error);
}