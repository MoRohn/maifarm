-- Migration 024: Column Synchronization and Aliases
-- This migration adds missing columns and creates compatibility aliases

BEGIN;

-- ============================================
-- TOKEN_USAGE TABLE FIXES
-- ============================================

-- Add missing columns to token_usage table
DO $$
BEGIN
    -- Add input_tokens column (alias for prompt_tokens)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'token_usage' 
        AND column_name = 'input_tokens'
    ) THEN
        ALTER TABLE token_usage ADD COLUMN input_tokens INTEGER DEFAULT 0;
        UPDATE token_usage SET input_tokens = prompt_tokens WHERE input_tokens = 0;
    END IF;

    -- Add output_tokens column (alias for completion_tokens)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'token_usage' 
        AND column_name = 'output_tokens'
    ) THEN
        ALTER TABLE token_usage ADD COLUMN output_tokens INTEGER DEFAULT 0;
        UPDATE token_usage SET output_tokens = completion_tokens WHERE output_tokens = 0;
    END IF;

    -- Add input_cost column (alias for prompt_cost)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'token_usage' 
        AND column_name = 'input_cost'
    ) THEN
        ALTER TABLE token_usage ADD COLUMN input_cost DECIMAL(10, 6) DEFAULT 0;
        UPDATE token_usage SET input_cost = prompt_cost WHERE input_cost = 0;
    END IF;

    -- Add output_cost column (alias for completion_cost)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'token_usage' 
        AND column_name = 'output_cost'
    ) THEN
        ALTER TABLE token_usage ADD COLUMN output_cost DECIMAL(10, 6) DEFAULT 0;
        UPDATE token_usage SET output_cost = completion_cost WHERE output_cost = 0;
    END IF;

    -- Add estimated_local_cost column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'token_usage' 
        AND column_name = 'estimated_local_cost'
    ) THEN
        ALTER TABLE token_usage ADD COLUMN estimated_local_cost DECIMAL(10, 6) DEFAULT 0;
    END IF;

    -- Add currency column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'token_usage' 
        AND column_name = 'currency'
    ) THEN
        ALTER TABLE token_usage ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';
    END IF;
END $$;

-- ============================================
-- GOWILD_SESSIONS TABLE FIXES
-- ============================================

-- Add metrics column to gowild_sessions table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'gowild_sessions' 
        AND column_name = 'metrics'
    ) THEN
        ALTER TABLE gowild_sessions ADD COLUMN metrics JSONB DEFAULT '{}';
        
        -- Initialize metrics with existing data
        UPDATE gowild_sessions 
        SET metrics = jsonb_build_object(
            'nodesExplored', COALESCE(discoveries_count, 0),
            'discoveriesMade', COALESCE(discoveries_count, 0),
            'totalValue', 0,
            'checkpoints', COALESCE(checkpoints_count, 0),
            'rollbacks', COALESCE(rollbacks_count, 0)
        )
        WHERE metrics = '{}' OR metrics IS NULL;
    END IF;
END $$;

-- ============================================
-- TRIGGERS FOR COLUMN SYNC
-- ============================================

-- Create trigger to keep token_usage columns in sync
CREATE OR REPLACE FUNCTION sync_token_usage_columns() 
RETURNS TRIGGER AS $$
BEGIN
    -- Sync input/output with prompt/completion
    IF NEW.input_tokens IS NOT NULL AND NEW.prompt_tokens IS NULL THEN
        NEW.prompt_tokens := NEW.input_tokens;
    ELSIF NEW.prompt_tokens IS NOT NULL AND NEW.input_tokens IS NULL THEN
        NEW.input_tokens := NEW.prompt_tokens;
    END IF;
    
    IF NEW.output_tokens IS NOT NULL AND NEW.completion_tokens IS NULL THEN
        NEW.completion_tokens := NEW.output_tokens;
    ELSIF NEW.completion_tokens IS NOT NULL AND NEW.output_tokens IS NULL THEN
        NEW.output_tokens := NEW.completion_tokens;
    END IF;
    
    IF NEW.input_cost IS NOT NULL AND NEW.prompt_cost IS NULL THEN
        NEW.prompt_cost := NEW.input_cost;
    ELSIF NEW.prompt_cost IS NOT NULL AND NEW.input_cost IS NULL THEN
        NEW.input_cost := NEW.prompt_cost;
    END IF;
    
    IF NEW.output_cost IS NOT NULL AND NEW.completion_cost IS NULL THEN
        NEW.completion_cost := NEW.output_cost;
    ELSIF NEW.completion_cost IS NOT NULL AND NEW.output_cost IS NULL THEN
        NEW.output_cost := NEW.completion_cost;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS sync_token_usage_columns_trigger ON token_usage;
CREATE TRIGGER sync_token_usage_columns_trigger
    BEFORE INSERT OR UPDATE ON token_usage
    FOR EACH ROW
    EXECUTE FUNCTION sync_token_usage_columns();

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Create indexes for new columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_token_usage_input_tokens ON token_usage(input_tokens);
CREATE INDEX IF NOT EXISTS idx_token_usage_output_tokens ON token_usage(output_tokens);
CREATE INDEX IF NOT EXISTS idx_gowild_sessions_metrics ON gowild_sessions USING gin(metrics);

-- ============================================
-- VERIFY CHANGES
-- ============================================

-- Verification queries
DO $$
DECLARE
    missing_columns TEXT := '';
BEGIN
    -- Check token_usage columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'token_usage' AND column_name = 'input_tokens') THEN
        missing_columns := missing_columns || 'token_usage.input_tokens, ';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'token_usage' AND column_name = 'output_tokens') THEN
        missing_columns := missing_columns || 'token_usage.output_tokens, ';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'token_usage' AND column_name = 'input_cost') THEN
        missing_columns := missing_columns || 'token_usage.input_cost, ';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'token_usage' AND column_name = 'output_cost') THEN
        missing_columns := missing_columns || 'token_usage.output_cost, ';
    END IF;
    
    -- Check gowild_sessions columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gowild_sessions' AND column_name = 'metrics') THEN
        missing_columns := missing_columns || 'gowild_sessions.metrics, ';
    END IF;
    
    -- Report results
    IF missing_columns != '' THEN
        RAISE WARNING 'Missing columns after migration: %', rtrim(missing_columns, ', ');
    ELSE
        RAISE NOTICE '✅ All required columns are present';
    END IF;
END $$;

COMMIT;

-- Migration complete