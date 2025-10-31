-- Migration 036: Fix remaining missing columns identified in runtime errors
-- This migration adds columns that are being queried but don't exist

-- Fix harvest_yield table - add yield_value column
ALTER TABLE harvest_yield
ADD COLUMN IF NOT EXISTS yield_value DECIMAL(10, 2);

-- Fix token_usage table - add input_cost column
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'token_usage') THEN
        ALTER TABLE token_usage
        ADD COLUMN IF NOT EXISTS input_cost DECIMAL(10, 4) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS output_cost DECIMAL(10, 4) DEFAULT 0;
    END IF;
END $$;

-- Fix metrics table - add source column
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'metrics') THEN
        ALTER TABLE metrics
        ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'system';
    END IF;
END $$;

-- Fix sessions table - add farm_id column if it doesn't exist
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;

-- Add indexes for performance on these new columns
CREATE INDEX IF NOT EXISTS idx_harvest_yield_value ON harvest_yield(yield_value);
CREATE INDEX IF NOT EXISTS idx_token_usage_costs ON token_usage(input_cost, output_cost);
CREATE INDEX IF NOT EXISTS idx_metrics_source ON metrics(source);
CREATE INDEX IF NOT EXISTS idx_sessions_farm_id ON sessions(farm_id);

-- Add comments for documentation
COMMENT ON COLUMN harvest_yield.yield_value IS 'Numeric value of the yield for metrics calculations';
COMMENT ON COLUMN token_usage.input_cost IS 'Cost of input tokens in USD';
COMMENT ON COLUMN token_usage.output_cost IS 'Cost of output tokens in USD';
COMMENT ON COLUMN metrics.source IS 'Source system that generated this metric';
COMMENT ON COLUMN sessions.farm_id IS 'Associated farm for this session';