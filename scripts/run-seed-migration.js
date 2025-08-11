#!/usr/bin/env node

/**
 * Simple migration runner for the Seeds enhancement
 * This script applies the 010_enhance_seeds_for_harvest_integration.sql migration
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'maifarm',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

async function runMigration() {
  const pool = new Pool(dbConfig);
  
  try {
    console.log('🌱 Running Seeds enhancement migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '../server/database/migrations/010_enhance_seeds_for_harvest_integration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('📦 Seeds table now supports:');
    console.log('   - harvest_id column for linking to harvests');
    console.log('   - barn_data JSONB column for storing harvest context');
    console.log('   - additional_prompt TEXT column for user prompt additions');
    console.log('   - source_type column for tracking seed origin');
    console.log('   - Generated metadata column for YAML indexing');
    console.log('   - New view: seeds_with_harvest_info');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Migration appears to have been already applied');
    }
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration().catch(console.error);