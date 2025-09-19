-- Migration: Fix startup errors
-- Date: 2025-09-06
-- Description: Fixes missing database objects and constraints causing startup errors

-- 1. Create barn_sync_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS barn_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Sync details
    operation VARCHAR(50) NOT NULL,
    source VARCHAR(100),
    destination VARCHAR(100),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    items_total INTEGER DEFAULT 0,
    items_synced INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    items_deleted INTEGER DEFAULT 0,
    bytes_total BIGINT DEFAULT 0,
    bytes_synced BIGINT DEFAULT 0,
    
    -- Error tracking
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    
    -- Timing
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT barn_sync_log_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled'
    ))
);

-- Create indexes for barn_sync_log
CREATE INDEX IF NOT EXISTS idx_barn_sync_log_sync_id ON barn_sync_log(sync_id);
CREATE INDEX IF NOT EXISTS idx_barn_sync_log_status ON barn_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_barn_sync_log_operation ON barn_sync_log(operation);
CREATE INDEX IF NOT EXISTS idx_barn_sync_log_started_at ON barn_sync_log(started_at);

-- 2. Fix agents status constraint to include 'timeout' status
ALTER TABLE agents DROP CONSTRAINT IF EXISTS check_agents_valid_status;
ALTER TABLE agents ADD CONSTRAINT check_agents_valid_status CHECK (status IN (
    'idle', 'initializing', 'active', 'working', 'busy',
    'completed', 'paused', 'error', 'failed', 'terminating',
    'terminated', 'processing', 'starting', 'ready',
    'disconnected', 'shutting_down', 'timeout'
));

-- 3. Clean up any agents with invalid status
UPDATE agents 
SET status = 'failed' 
WHERE status = 'timeout';

-- 4. Add version tracking for migrations if not exists
CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64),
    execution_time_ms INTEGER
);

-- Record this migration
INSERT INTO migration_history (filename) 
VALUES ('030_fix_startup_errors.sql')
ON CONFLICT (filename) DO NOTHING;