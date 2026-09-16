#!/usr/bin/env node
/**
 * Complete data cleanup script for MaiFarm
 * Removes all farms, agents, harvests, and associated data
 * Resets the system to a clean state
 */

const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Database configuration from environment
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'maifarm',
  user: process.env.DB_USER || 'maifarm',
  password: process.env.DB_PASSWORD || 'maifarm_password'
};

async function cleanDatabase() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Get counts before cleanup
    const beforeCounts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM farms) as farms,
        (SELECT COUNT(*) FROM agents) as agents,
        (SELECT COUNT(*) FROM harvests) as harvests,
        (SELECT COUNT(*) FROM tasks) as tasks,
        (SELECT COUNT(*) FROM seeds) as seeds,
        (SELECT COUNT(*) FROM token_usage) as token_usage
    `);
    
    console.log('\n📊 Current data counts:');
    console.log('  Farms:', beforeCounts.rows[0].farms);
    console.log('  Agents:', beforeCounts.rows[0].agents);
    console.log('  Harvests:', beforeCounts.rows[0].harvests);
    console.log('  Tasks:', beforeCounts.rows[0].tasks);
    console.log('  Seeds:', beforeCounts.rows[0].seeds);
    console.log('  Token Usage:', beforeCounts.rows[0].token_usage);
    
    if (beforeCounts.rows[0].farms === '0') {
      console.log('\n✨ Database is already clean!');
      return;
    }
    
    console.log('\n🗑️  Cleaning database tables...');
    
    // Delete in correct order to respect foreign key constraints
    const tables = [
      'health_checks',
      'farm_lifecycle_events',
      'token_usage',
      'tasks',
      'agents',
      'harvests',
      'seeds',
      'farms',
      'api_keys'  // Optional: remove if you want to keep API keys
    ];
    
    for (const table of tables) {
      try {
        const result = await client.query(`DELETE FROM ${table}`);
        console.log(`  ✓ Cleaned ${table}: ${result.rowCount} rows deleted`);
      } catch (error) {
        console.log(`  ⚠ Failed to clean ${table}:`, error.message);
      }
    }
    
    // Reset sequences/counters if they exist
    try {
      await client.query(`
        ALTER SEQUENCE IF EXISTS farms_id_seq RESTART WITH 1;
        ALTER SEQUENCE IF EXISTS agents_id_seq RESTART WITH 1;
        ALTER SEQUENCE IF EXISTS harvests_id_seq RESTART WITH 1;
        ALTER SEQUENCE IF EXISTS tasks_id_seq RESTART WITH 1;
      `);
      console.log('  ✓ Reset ID sequences');
    } catch (error) {
      // Sequences might not exist for UUID-based tables
      console.log('  ℹ No sequences to reset (using UUIDs)');
    }
    
    console.log('\n✅ Database cleaned successfully!');
    
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
  } finally {
    await client.end();
  }
}

async function cleanFileSystem() {
  console.log('\n🗑️  Cleaning file system...');
  
  const dirsToClean = [
    'maibarn/harvests',
    'maibarn/workspaces/active',
    'maibarn/workspaces/archived',
    'maibarn/coordination',
    'maibarn/terminals',
    'maibarn/barn/items',
    'maibarn/xenosync-sessions',
    'uploads/farm-context'
  ];
  
  for (const dir of dirsToClean) {
    const fullPath = path.join(process.cwd(), dir);
    try {
      // Check if directory exists
      await fs.access(fullPath);
      
      // Get list of items
      const items = await fs.readdir(fullPath);
      let count = 0;
      
      // Delete all items except .gitkeep
      for (const item of items) {
        if (item !== '.gitkeep') {
          const itemPath = path.join(fullPath, item);
          const stats = await fs.stat(itemPath);
          
          if (stats.isDirectory()) {
            await fs.rm(itemPath, { recursive: true, force: true });
          } else {
            await fs.unlink(itemPath);
          }
          count++;
        }
      }
      
      console.log(`  ✓ Cleaned ${dir}: ${count} items deleted`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`  ℹ ${dir} does not exist`);
      } else {
        console.log(`  ⚠ Failed to clean ${dir}:`, error.message);
      }
    }
  }
  
  console.log('\n✅ File system cleaned successfully!');
}

async function cleanTmuxSessions() {
  console.log('\n🗑️  Cleaning tmux sessions...');
  
  return new Promise((resolve) => {
    // List all tmux sessions
    const listSessions = spawn('tmux', ['list-sessions', '-F', '#{session_name}']);
    let sessions = '';
    
    listSessions.stdout.on('data', (data) => {
      sessions += data.toString();
    });
    
    listSessions.on('close', (code) => {
      if (code !== 0) {
        console.log('  ℹ No tmux sessions to clean');
        resolve();
        return;
      }
      
      const sessionList = sessions.split('\n').filter(s => s);
      const farmSessions = sessionList.filter(s => 
        s.startsWith('farm-') || 
        s.startsWith('quick-') || 
        s.startsWith('xenosync-') ||
        s.startsWith('goWild-') ||
        s.startsWith('qt-')
      );
      
      if (farmSessions.length === 0) {
        console.log('  ℹ No farm-related tmux sessions found');
        resolve();
        return;
      }
      
      console.log(`  Found ${farmSessions.length} farm-related sessions to clean`);
      
      // Kill each session
      let cleaned = 0;
      farmSessions.forEach(session => {
        const kill = spawn('tmux', ['kill-session', '-t', session]);
        kill.on('close', () => {
          cleaned++;
          console.log(`  ✓ Killed session: ${session}`);
          
          if (cleaned === farmSessions.length) {
            console.log('\n✅ Tmux sessions cleaned successfully!');
            resolve();
          }
        });
      });
    });
    
    listSessions.on('error', () => {
      console.log('  ℹ tmux not available');
      resolve();
    });
  });
}

async function cleanRedisCache() {
  console.log('\n🗑️  Cleaning Redis cache...');
  
  return new Promise((resolve) => {
    const redis = spawn('redis-cli', ['FLUSHDB']);
    
    redis.on('close', (code) => {
      if (code === 0) {
        console.log('  ✓ Redis cache cleared');
      } else {
        console.log('  ℹ Redis not available or already clean');
      }
      resolve();
    });
    
    redis.on('error', () => {
      console.log('  ℹ Redis not available');
      resolve();
    });
  });
}

async function main() {
  console.log('🧹 MaiFarm Complete Data Cleanup');
  console.log('================================');
  console.log('This will remove ALL farms, agents, harvests, and associated data.');
  console.log('');
  
  // Add a confirmation prompt
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('Are you sure you want to continue? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n❌ Cleanup cancelled');
      readline.close();
      process.exit(0);
    }
    
    readline.close();
    
    console.log('\nStarting cleanup...\n');
    
    try {
      // Clean in order
      await cleanDatabase();
      await cleanFileSystem();
      await cleanTmuxSessions();
      await cleanRedisCache();
      
      console.log('\n' + '='.repeat(50));
      console.log('✨ CLEANUP COMPLETE!');
      console.log('='.repeat(50));
      console.log('\nYour MaiFarm installation is now clean.');
      console.log('You can start fresh with no old data affecting metrics.');
      console.log('\nRestart your server to see clean metrics:');
      console.log('  npm run dev');
      
    } catch (error) {
      console.error('\n❌ Cleanup failed:', error);
      process.exit(1);
    }
  });
}

// Run cleanup
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});