/**
 * Ensures core database tables exist
 * This handles cases where migrations were marked complete but tables don't exist
 */

import { db } from './connection';

export async function ensureCoreTables(): Promise<void> {
  try {
    // Check if core tables exist
    const tables = ['users', 'farms', 'agents', 'tasks', 'sessions', 'harvests', 'seeds'];
    const missingTables: string[] = [];
    
    for (const table of tables) {
      const result = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      
      if (!result.rows[0]?.exists) {
        missingTables.push(table);
      }
    }
    
    if (missingTables.length === 0) {
      console.log('[DATABASE] All core tables exist');
      return;
    }
    
    console.log(`[DATABASE] Missing tables detected: ${missingTables.join(', ')}`);
    console.log('[DATABASE] Creating core tables...');
    
    // Create users table if missing
    if (missingTables.includes('users')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255),
          roles TEXT[] DEFAULT ARRAY['user'],
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DATABASE] Created users table');
    }
    
    // Create farms table if missing
    if (missingTables.includes('farms')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS farms (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'idle',
          type VARCHAR(50) DEFAULT 'sequential',
          config JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          created_by UUID,
          seed_id UUID,
          tmux_session VARCHAR(255),
          farmer_template_id VARCHAR(255),
          farmer_template_name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DATABASE] Created farms table');
    }
    
    // Create agents table if missing
    if (missingTables.includes('agents')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS agents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          farm_id UUID,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) DEFAULT 'standard',
          status VARCHAR(50) DEFAULT 'idle',
          capabilities TEXT[],
          resources JSONB DEFAULT '{}',
          metrics JSONB DEFAULT '{}',
          config JSONB DEFAULT '{}',
          last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DATABASE] Created agents table');
    }
    
    // Create tasks table if missing
    if (missingTables.includes('tasks')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          farm_id UUID,
          agent_id UUID,
          type VARCHAR(50) NOT NULL,
          priority VARCHAR(20) DEFAULT 'medium',
          status VARCHAR(50) DEFAULT 'pending',
          payload JSONB DEFAULT '{}',
          result JSONB,
          error TEXT,
          dependencies UUID[],
          retries INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 3,
          timeout INTEGER,
          metadata JSONB DEFAULT '{}',
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DATABASE] Created tasks table');
    }
    
    // Create sessions table if missing
    if (missingTables.includes('sessions')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          token TEXT UNIQUE NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DATABASE] Created sessions table');
    }
    
    // Create harvests table if missing
    if (missingTables.includes('harvests')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS harvests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          farm_id UUID,
          created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000',
          type VARCHAR(50) DEFAULT 'manual',
          category VARCHAR(100),
          status VARCHAR(50) DEFAULT 'pending',
          data JSONB NOT NULL DEFAULT '{}',
          summary JSONB DEFAULT '{}',
          results JSONB DEFAULT '[]',
          insights JSONB DEFAULT '[]',
          quality JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          file_count INTEGER DEFAULT 0,
          total_size BIGINT DEFAULT 0,
          export_formats TEXT[] DEFAULT '{json,markdown,pdf}',
          yield_value INTEGER DEFAULT 0,
          farmer_template_id VARCHAR(255),
          farmer_template_name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        )
      `);
      console.log('[DATABASE] Created harvests table');
    }
    
    // Create seeds table if missing
    if (missingTables.includes('seeds')) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS seeds (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(100),
          config JSONB NOT NULL DEFAULT '{}',
          yaml_content TEXT,
          yaml_metadata JSONB DEFAULT '{}',
          additional_prompt TEXT,
          source_type VARCHAR(50) DEFAULT 'manual',
          source_seed_id UUID,
          harvest_id UUID,
          barn_data JSONB DEFAULT '{}',
          is_public BOOLEAN DEFAULT FALSE,
          usage_count INTEGER DEFAULT 0,
          rating DECIMAL(3, 2),
          tags TEXT[] DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('[DATABASE] Created seeds table');
    }
    
    console.log('[DATABASE] Core tables created successfully');
    
  } catch (error) {
    console.error('[DATABASE] Error ensuring core tables:', error);
    // Don't throw - allow server to start even if some tables can't be created
  }
}