-- Migration 038: Fix column name mismatches
-- This migration adds missing columns and creates aliases for compatibility

-- Fix token_usage table - add prompt_cost column (alias for cost)
ALTER TABLE token_usage
ADD COLUMN IF NOT EXISTS prompt_cost NUMERIC(10, 6) DEFAULT 0;

-- Update prompt_cost with existing cost values if they exist
UPDATE token_usage SET prompt_cost = cost WHERE prompt_cost = 0 AND cost IS NOT NULL;

-- Fix api_keys table - add key_hash column
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS key_hash VARCHAR(255);

-- Fix metrics table - add source_id column
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'metrics') THEN
        ALTER TABLE metrics
        ADD COLUMN IF NOT EXISTS source_id VARCHAR(100);
    END IF;
END $$;

-- Fix the sessions table to ensure farm_id column exists and is properly referenced
-- First check if sessions table has an 's' alias issue
DO $$
BEGIN
    -- Ensure sessions table has farm_id column
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'sessions' AND column_name = 'farm_id') THEN
        ALTER TABLE sessions ADD COLUMN farm_id UUID;
    END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_token_usage_prompt_cost ON token_usage(prompt_cost);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_metrics_source_id ON metrics(source_id) WHERE source_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN token_usage.prompt_cost IS 'Cost of prompt tokens (alias for cost column)';
COMMENT ON COLUMN api_keys.key_hash IS 'Hash of the API key for verification';
COMMENT ON COLUMN metrics.source_id IS 'Identifier of the source that generated this metric';