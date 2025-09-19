-- Comprehensive fix for all startup database issues
-- This script adds all missing columns and fixes schema problems

-- Fix harvests table
ALTER TABLE harvests 
ADD COLUMN IF NOT EXISTS farm_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS harvest_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS harvest_path TEXT;

-- Fix barn_items table
ALTER TABLE barn_items
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100),
ADD COLUMN IF NOT EXISTS category VARCHAR(100),
ADD COLUMN IF NOT EXISTS size BIGINT DEFAULT 0;

-- Fix barn_sync_log table
ALTER TABLE barn_sync_log
ADD COLUMN IF NOT EXISTS items_added INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS items_updated INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS items_removed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sync_duration_ms INTEGER;

-- Fix farms table
ALTER TABLE farms
ADD COLUMN IF NOT EXISTS orchestrator_type VARCHAR(50) DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS workspace_path TEXT,
ADD COLUMN IF NOT EXISTS coordination_dir TEXT;

-- Fix agents table  
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS tmux_pane INTEGER,
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP,
ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS workspace_path TEXT;

-- Fix api_keys table
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS service VARCHAR(50),
ADD COLUMN IF NOT EXISTS name VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Fix token_usage table
ALTER TABLE token_usage
ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS model VARCHAR(100),
ADD COLUMN IF NOT EXISTS cost_estimate DECIMAL(10, 6);

-- Create any missing tables
CREATE TABLE IF NOT EXISTS harvest_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID REFERENCES harvests(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS farm_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    check_type VARCHAR(50),
    status VARCHAR(50),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coordination_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID,
    event_type VARCHAR(100),
    event_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_harvests_farm_name ON harvests(farm_name);
CREATE INDEX IF NOT EXISTS idx_barn_items_category ON barn_items(category);
CREATE INDEX IF NOT EXISTS idx_barn_items_subcategory ON barn_items(subcategory);
CREATE INDEX IF NOT EXISTS idx_agents_health_status ON agents(health_status);
CREATE INDEX IF NOT EXISTS idx_farms_status ON farms(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service);

-- Update any null values with defaults
UPDATE harvests SET farm_name = 'unknown' WHERE farm_name IS NULL;
UPDATE barn_items SET category = 'general' WHERE category IS NULL;
UPDATE barn_items SET subcategory = 'uncategorized' WHERE subcategory IS NULL;
UPDATE barn_sync_log SET items_added = 0 WHERE items_added IS NULL;
UPDATE barn_sync_log SET items_updated = 0 WHERE items_updated IS NULL;
UPDATE barn_sync_log SET items_removed = 0 WHERE items_removed IS NULL;

-- Add constraints if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'harvests_farm_id_fkey') THEN
        ALTER TABLE harvests ADD CONSTRAINT harvests_farm_id_fkey 
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
END$$;

-- Fix any orphaned records
DELETE FROM agents WHERE farm_id NOT IN (SELECT id FROM farms);
DELETE FROM harvests WHERE farm_id IS NOT NULL AND farm_id NOT IN (SELECT id FROM farms);

-- Reset sequences if needed
SELECT setval('farms_id_seq', COALESCE((SELECT MAX(id) FROM farms), 1), false) 
WHERE EXISTS (SELECT 1 FROM pg_class WHERE relname = 'farms_id_seq');

-- Grant permissions if needed
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO maifarm;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO maifarm;

-- Vacuum and analyze for performance
VACUUM ANALYZE;