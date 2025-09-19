-- Fix migration issues by checking for existence before creating
-- This migration runs first (000) to clean up any issues

-- First, ensure the update_updated_at_column function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

-- Add missing columns if they don't exist
DO $block$
BEGIN
    -- Add last_heartbeat to farms if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='farms') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='farms' AND column_name='last_heartbeat') THEN
        ALTER TABLE farms ADD COLUMN last_heartbeat TIMESTAMP;
    END IF;

    -- Add orphaned_at to farms if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='farms') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='farms' AND column_name='orphaned_at') THEN
        ALTER TABLE farms ADD COLUMN orphaned_at TIMESTAMP;
    END IF;

    -- Add health_status to agents if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agents') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='agents' AND column_name='health_status') THEN
        ALTER TABLE agents ADD COLUMN health_status VARCHAR(50);
    END IF;

    -- Add token to sessions if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sessions') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='sessions' AND column_name='token') THEN
        ALTER TABLE sessions ADD COLUMN token TEXT;
    END IF;

    -- Add category to metrics if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='metrics' AND column_name='category') THEN
        ALTER TABLE metrics ADD COLUMN category VARCHAR(50);
    END IF;
END $block$;

-- Create missing tables if they don't exist (but only if farms table exists)
DO $block$
BEGIN
    -- Only create tmux_sessions if farms table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='farms') THEN
        CREATE TABLE IF NOT EXISTS tmux_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_name VARCHAR(255) UNIQUE NOT NULL,
            farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    END IF;

    -- Only create farm_lifecycle_events if farms table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='farms') THEN
        CREATE TABLE IF NOT EXISTS farm_lifecycle_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
            event_type VARCHAR(50) NOT NULL,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    END IF;
END $block$;

-- This migration is automatically tracked by UnifiedMigrationRunner
-- No need to manually insert into migrations table