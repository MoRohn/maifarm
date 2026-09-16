-- Migration 035: Fix all missing columns and tables identified in startup errors
-- This migration adds missing columns that were causing startup failures

-- Add missing columns to farms table
ALTER TABLE farms
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMP,
ADD COLUMN IF NOT EXISTS tmux_session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS session_preserved BOOLEAN DEFAULT FALSE;

-- Add missing columns to harvests table (if the table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'harvests') THEN
        ALTER TABLE harvests
        ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10, 4) DEFAULT 0;
    END IF;
END $$;

-- Add missing columns to metrics table (if the table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'metrics') THEN
        -- Add category column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'metrics' AND column_name = 'category') THEN
            ALTER TABLE metrics ADD COLUMN category VARCHAR(50);
        END IF;

        -- Add total_cost column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'metrics' AND column_name = 'total_cost') THEN
            ALTER TABLE metrics ADD COLUMN total_cost DECIMAL(10, 4) DEFAULT 0;
        END IF;
    END IF;
END $$;

-- Add missing columns to agents table
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create gowild_sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS gowild_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active',
    creativity_level INTEGER DEFAULT 5,
    boundary_config JSONB DEFAULT '{}',
    discoveries JSONB DEFAULT '[]',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create gowild_discoveries table if it doesn't exist
CREATE TABLE IF NOT EXISTS gowild_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES gowild_sessions(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    discovery_type VARCHAR(100),
    discovery_data JSONB NOT NULL,
    confidence_score DECIMAL(3, 2),
    impact_score DECIMAL(3, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create harvest_yield table if it doesn't exist (needed for metrics queries)
CREATE TABLE IF NOT EXISTS harvest_yield (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    yield_type VARCHAR(100),
    yield_data JSONB,
    quality_score DECIMAL(3, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_farms_deleted_at ON farms(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_farms_last_health_check ON farms(last_health_check);
CREATE INDEX IF NOT EXISTS idx_gowild_sessions_farm_id ON gowild_sessions(farm_id);
CREATE INDEX IF NOT EXISTS idx_gowild_discoveries_session_id ON gowild_discoveries(session_id);
CREATE INDEX IF NOT EXISTS idx_harvest_yield_harvest_id ON harvest_yield(harvest_id);

-- Update existing NULL values to reasonable defaults
UPDATE farms SET last_health_check = updated_at WHERE last_health_check IS NULL AND status IN ('active', 'running');
UPDATE farms SET tmux_session_id = tmux_session WHERE tmux_session_id IS NULL AND tmux_session IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN farms.deleted_at IS 'Soft delete timestamp for logical deletion';
COMMENT ON COLUMN farms.last_health_check IS 'Last time health check was performed on this farm';
COMMENT ON COLUMN farms.tmux_session_id IS 'Unique identifier for tmux session';
COMMENT ON COLUMN farms.session_preserved IS 'Whether the tmux session should be preserved after farm stops';