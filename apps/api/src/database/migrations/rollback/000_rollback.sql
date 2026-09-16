-- Rollback script for migration 000_fix_migration_issues_v2
-- This script safely removes changes made by the migration

DO $$
BEGIN
    -- Remove added columns from farms table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='farms' AND column_name='last_heartbeat'
    ) THEN
        ALTER TABLE farms DROP COLUMN IF EXISTS last_heartbeat;
        RAISE NOTICE 'Removed last_heartbeat column from farms table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='farms' AND column_name='orphaned_at'
    ) THEN
        ALTER TABLE farms DROP COLUMN IF EXISTS orphaned_at;
        RAISE NOTICE 'Removed orphaned_at column from farms table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='farms' AND column_name='correlation_id'
    ) THEN
        ALTER TABLE farms DROP COLUMN IF EXISTS correlation_id;
        RAISE NOTICE 'Removed correlation_id column from farms table';
    END IF;

    -- Remove added columns from agents table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='agents' AND column_name='health_status'
    ) THEN
        ALTER TABLE agents DROP COLUMN IF EXISTS health_status;
        RAISE NOTICE 'Removed health_status column from agents table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='agents' AND column_name='last_activity'
    ) THEN
        ALTER TABLE agents DROP COLUMN IF EXISTS last_activity;
        RAISE NOTICE 'Removed last_activity column from agents table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='agents' AND column_name='recovery_attempts'
    ) THEN
        ALTER TABLE agents DROP COLUMN IF EXISTS recovery_attempts;
        RAISE NOTICE 'Removed recovery_attempts column from agents table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='agents' AND column_name='correlation_id'
    ) THEN
        ALTER TABLE agents DROP COLUMN IF EXISTS correlation_id;
        RAISE NOTICE 'Removed correlation_id column from agents table';
    END IF;

    -- Remove added columns from sessions table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='sessions' AND column_name='token'
    ) THEN
        ALTER TABLE sessions DROP COLUMN IF EXISTS token;
        RAISE NOTICE 'Removed token column from sessions table';
    END IF;

    -- Remove added columns from metrics table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='metrics' AND column_name='category'
    ) THEN
        ALTER TABLE metrics DROP COLUMN IF EXISTS category;
        RAISE NOTICE 'Removed category column from metrics table';
    END IF;

    -- Remove added columns from harvests table
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='harvests' AND column_name='correlation_id'
    ) THEN
        ALTER TABLE harvests DROP COLUMN IF EXISTS correlation_id;
        RAISE NOTICE 'Removed correlation_id column from harvests table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='harvests' AND column_name='collection_locked'
    ) THEN
        ALTER TABLE harvests DROP COLUMN IF EXISTS collection_locked;
        RAISE NOTICE 'Removed collection_locked column from harvests table';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='harvests' AND column_name='agents_completed'
    ) THEN
        ALTER TABLE harvests DROP COLUMN IF EXISTS agents_completed;
        RAISE NOTICE 'Removed agents_completed column from harvests table';
    END IF;

    -- Remove added indexes
    DROP INDEX IF EXISTS idx_agents_farm_id;
    DROP INDEX IF EXISTS idx_harvests_farm_id;
    DROP INDEX IF EXISTS idx_farms_status;
    DROP INDEX IF EXISTS idx_farms_correlation_id;
    RAISE NOTICE 'Removed added indexes';

    -- Remove migration marker
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='schema_migrations') THEN
        DELETE FROM schema_migrations WHERE version = '000_fix_migration_issues_v2';
        RAISE NOTICE 'Removed migration marker for 000_fix_migration_issues_v2';
    END IF;

    -- Note: We keep the update_updated_at_column function as it may be used by other migrations

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but continue
        RAISE WARNING 'Rollback encountered error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        -- Only fail on critical errors
        IF SQLSTATE NOT IN ('42704', '42703', '42P01') THEN
            -- 42704: index doesn't exist
            -- 42703: column doesn't exist
            -- 42P01: table doesn't exist
            RAISE;
        END IF;
END $$;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Rollback of migration 000_fix_migration_issues_v2 completed';
END $$;