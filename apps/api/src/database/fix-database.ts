#!/usr/bin/env node

import { Pool } from 'pg';
import MigrationFixer from './fixMigrations.js';
import { RobustMigrationRunner } from './migrationRunner.js';
import { MigrationRecoverySystem } from './migrationRecovery.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const _currentFilePath = fileURLToPath(import.meta.url);
const _currentDirPath = path.dirname(_currentFilePath);

// Load environment variables
dotenv.config({ path: path.join(_currentDirPath, '../../.env.development') });

/**
 * Comprehensive database fix utility
 * Fixes all migration issues and ensures database is in correct state
 */

async function fixDatabase() {
  console.log('🔧 DATABASE FIX UTILITY');
  console.log('='.repeat(60));
  console.log('This utility will:');
  console.log('  1. Backup and fix migration files');
  console.log('  2. Run migrations with proper transaction handling');
  console.log('  3. Recover missing tables');
  console.log('  4. Validate the complete database structure');
  console.log('='.repeat(60) + '\n');

  // Create PostgreSQL connection pool
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'maifarm_dev',
    user: process.env.DB_USER || 'maifarm',
    password: process.env.DB_PASSWORD || 'maifarm123',
    max: 5
  });

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected\n');

    // Step 1: Fix migration files
    console.log('📝 STEP 1: Fixing migration files...');
    console.log('-'.repeat(40));
    const fixer = new MigrationFixer();
    await fixer.fixMigrations();
    const isValid = await fixer.validateMigrations();
    if (!isValid) {
      console.log('⚠️  Some migration issues remain, continuing anyway...\n');
    } else {
      console.log('✅ Migration files fixed and validated\n');
    }

    // Step 2: Run migrations
    console.log('🏗️  STEP 2: Running migrations...');
    console.log('-'.repeat(40));
    const runner = new RobustMigrationRunner(pool);
    await runner.runAllMigrations();
    console.log('✅ Migrations executed\n');

    // Step 3: Perform recovery
    console.log('🔄 STEP 3: Performing recovery...');
    console.log('-'.repeat(40));
    const recovery = new MigrationRecoverySystem(pool);
    const report = await recovery.performFullRecovery();

    // Final status
    console.log('\n' + '='.repeat(60));
    if (report.missingTables.length === 0) {
      console.log('✅ DATABASE FIX SUCCESSFUL');
      console.log('All tables are present and validated.');
    } else {
      console.log('⚠️  DATABASE PARTIALLY FIXED');
      console.log(`Still missing ${report.missingTables.length} tables:`);
      report.missingTables.forEach(table => console.log(`  - ${table}`));
      console.log('\nYou may need to:');
      console.log('  1. Check PostgreSQL logs for errors');
      console.log('  2. Manually create missing tables');
      console.log('  3. Contact support with the error details');
    }
    console.log('='.repeat(60));

    // Test critical queries
    console.log('\n🧪 Testing critical queries...');
    const tests = [
      { name: 'Farms', query: 'SELECT COUNT(*) as count FROM farms' },
      { name: 'Agents', query: 'SELECT COUNT(*) as count FROM agents' },
      { name: 'Tasks', query: 'SELECT COUNT(*) as count FROM tasks' },
      { name: 'API Keys', query: 'SELECT COUNT(*) as count FROM api_keys' },
      { name: 'Token Usage', query: 'SELECT COUNT(*) as count FROM token_usage' }
    ];

    let allTestsPassed = true;
    for (const test of tests) {
      try {
        const result = await pool.query(test.query);
        console.log(`  ✅ ${test.name}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`  ❌ ${test.name}: Table not accessible`);
        allTestsPassed = false;
      }
    }

    if (allTestsPassed) {
      console.log('\n🎉 All critical tables are accessible!');
    } else {
      console.log('\n⚠️  Some tables are still not accessible.');
    }

  } catch (error) {
    console.error('\n❌ DATABASE FIX FAILED');
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle command line arguments
const command = process.argv[2];

if (command === '--help' || command === '-h') {
  console.log('Usage: npm run db:fix [options]');
  console.log('\nOptions:');
  console.log('  --help, -h     Show this help message');
  console.log('  --restore      Restore migration files from backup');
  console.log('  --validate     Validate migration files only');
  console.log('\nWithout options, runs complete database fix');
  process.exit(0);
}

if (command === '--restore') {
  const fixer = new MigrationFixer();
  fixer.restoreBackups()
    .then(() => {
      console.log('✅ Migration files restored from backup');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Failed to restore backups:', error);
      process.exit(1);
    });
} else if (command === '--validate') {
  const fixer = new MigrationFixer();
  fixer.validateMigrations()
    .then(isValid => {
      if (isValid) {
        console.log('✅ All migration files are valid');
        process.exit(0);
      } else {
        console.log('❌ Migration files have issues');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    });
} else {
  // Run complete fix
  fixDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}