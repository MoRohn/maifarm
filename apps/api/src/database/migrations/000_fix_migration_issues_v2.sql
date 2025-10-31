-- Fix migration issues by checking for existence before creating (Version 2)
-- This migration runs first (000) to clean up any issues and ensure proper setup
-- Enhanced with better transaction handling and rollback support

-- Create or replace the update_updated_at_column function
-- This is safe to run multiple times and doesn't need existence check
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add missing columns using DO block for proper transaction handling
DO $$
BEGIN
    -- Add last_heartbeat to farms if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='farms') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='farms' AND column_name='last_heartbeat'
        ) THEN
            ALTER TABLE farms ADD COLUMN last_heartbeat TIMESTAMP;
            RAISE NOTICE 'Added last_heartbeat column to farms table';
        END IF;
    END IF;

    -- Add orphaned_at to farms if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='farms') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='farms' AND column_name='orphaned_at'
        ) THEN
            ALTER TABLE farms ADD COLUMN orphaned_at TIMESTAMP;
            RAISE NOTICE 'Added orphaned_at column to farms table';
        END IF;
    END IF;

    -- Add health_status to agents if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agents') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='agents' AND column_name='health_status'
        ) THEN
            ALTER TABLE agents ADD COLUMN health_status VARCHAR(50);
            RAISE NOTICE 'Added health_status column to agents table';
        END IF;
    END IF;

    -- Add last_activity to agents if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agents') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='agents' AND column_name='last_activity'
        ) THEN
            ALTER TABLE agents ADD COLUMN last_activity TIMESTAMP;
            RAISE NOTICE 'Added last_activity column to agents table';
        END IF;
    END IF;

    -- Add recovery_attempts to agents if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agents') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='agents' AND column_name='recovery_attempts'
        ) THEN
            ALTER TABLE agents ADD COLUMN recovery_attempts INTEGER DEFAULT 0;
            RAISE NOTICE 'Added recovery_attempts column to agents table';
        END IF;
    END IF;

    -- Add token to sessions if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sessions') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='sessions' AND column_name='token'
        ) THEN
            ALTER TABLE sessions ADD COLUMN token TEXT;
            RAISE NOTICE 'Added token column to sessions table';
        END IF;
    END IF;

    -- Add category to metrics if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='metrics') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='metrics' AND column_name='category'
        ) THEN
            ALTER TABLE metrics ADD COLUMN category VARCHAR(50);
            RAISE NOTICE 'Added category column to metrics table';
        END IF;
    END IF;

    -- Add correlation_id to various tables for request tracing
    -- farms table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='farms') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='farms' AND column_name='correlation_id'
        ) THEN
            ALTER TABLE farms ADD COLUMN correlation_id VARCHAR(100);
            RAISE NOTICE 'Added correlation_id column to farms table';
        END IF;
    END IF;

    -- agents table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agents') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='agents' AND column_name='correlation_id'
        ) THEN
            ALTER TABLE agents ADD COLUMN correlation_id VARCHAR(100);
            RAISE NOTICE 'Added correlation_id column to agents table';
        END IF;
    END IF;

    -- harvests table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='harvests') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='harvests' AND column_name='correlation_id'
        ) THEN
            ALTER TABLE harvests ADD COLUMN correlation_id VARCHAR(100);
            RAISE NOTICE 'Added correlation_id column to harvests table';
        END IF;

        -- Add harvest coordination columns
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='harvests' AND column_name='collection_locked'
        ) THEN
            ALTER TABLE harvests ADD COLUMN collection_locked BOOLEAN DEFAULT FALSE;
            RAISE NOTICE 'Added collection_locked column to harvests table';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='harvests' AND column_name='agents_completed'
        ) THEN
            ALTER TABLE harvests ADD COLUMN agents_completed INTEGER DEFAULT 0;
            RAISE NOTICE 'Added agents_completed column to harvests table';
        END IF;
    END IF;

    -- Add missing indexes for foreign keys and frequently queried columns
    -- Only create if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'agents' AND indexname = 'idx_agents_farm_id'
    ) THEN
        CREATE INDEX idx_agents_farm_id ON agents(farm_id);
        RAISE NOTICE 'Created index idx_agents_farm_id';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'harvests' AND indexname = 'idx_harvests_farm_id'
    ) THEN
        CREATE INDEX idx_harvests_farm_id ON harvests(farm_id);
        RAISE NOTICE 'Created index idx_harvests_farm_id';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'farms' AND indexname = 'idx_farms_status'
    ) THEN
        CREATE INDEX idx_farms_status ON farms(status);
        RAISE NOTICE 'Created index idx_farms_status';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'farms' AND indexname = 'idx_farms_correlation_id'
    ) THEN
        CREATE INDEX idx_farms_correlation_id ON farms(correlation_id);
        RAISE NOTICE 'Created index idx_farms_correlation_id';
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the migration
        RAISE WARNING 'Migration 000 encountered error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        -- Re-raise only if it's a critical error
        IF SQLSTATE NOT IN ('42P07', '42701', '42P01') THEN
            -- 42P07: relation already exists
            -- 42701: column already exists
            -- 42P01: table doesn't exist (expected for new installs)
            RAISE;
        END IF;
END $$;

-- Create a migration completion marker
DO $$
BEGIN
    -- Check if schema_migrations table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='schema_migrations') THEN
        -- Mark this migration as complete if not already done
        IF NOT EXISTS (
            SELECT 1 FROM schema_migrations
            WHERE version = '000_fix_migration_issues_v2'
        ) THEN
            INSERT INTO schema_migrations (version, executed_at)
            VALUES ('000_fix_migration_issues_v2', CURRENT_TIMESTAMP);
            RAISE NOTICE 'Marked migration 000_fix_migration_issues_v2 as complete';
        END IF;
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON FUNCTION update_updated_at_column() IS 'Trigger function to automatically update the updated_at timestamp';
COMMENT ON COLUMN farms.last_heartbeat IS 'Last heartbeat timestamp for farm health monitoring';
COMMENT ON COLUMN farms.orphaned_at IS 'Timestamp when farm was marked as orphaned';
COMMENT ON COLUMN farms.correlation_id IS 'Correlation ID for distributed request tracing';
COMMENT ON COLUMN agents.health_status IS 'Current health status of the agent (healthy, unhealthy, recovering)';
COMMENT ON COLUMN agents.last_activity IS 'Last detected activity timestamp for the agent';
COMMENT ON COLUMN agents.recovery_attempts IS 'Number of recovery attempts for failed agent';
COMMENT ON COLUMN agents.correlation_id IS 'Correlation ID for distributed request tracing';
COMMENT ON COLUMN harvests.correlation_id IS 'Correlation ID for distributed request tracing';
COMMENT ON COLUMN harvests.collection_locked IS 'Lock flag to prevent premature harvest collection';
COMMENT ON COLUMN harvests.agents_completed IS 'Number of agents that have completed their work';