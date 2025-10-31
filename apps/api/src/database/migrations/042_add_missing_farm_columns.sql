-- Add missing agents and metrics columns to farms table
-- These columns are referenced in the farm API but were missing from the schema

-- Add agents column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'farms' AND column_name = 'agents') THEN
        ALTER TABLE farms ADD COLUMN agents JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Add metrics column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'farms' AND column_name = 'metrics') THEN
        ALTER TABLE farms ADD COLUMN metrics JSONB DEFAULT '{"totalTokens": 0, "totalCost": 0}'::jsonb;
    END IF;
END $$;

-- Create index on agents for better query performance
CREATE INDEX IF NOT EXISTS idx_farms_agents ON farms USING GIN (agents);

-- Create index on metrics for analytics queries
CREATE INDEX IF NOT EXISTS idx_farms_metrics ON farms USING GIN (metrics);