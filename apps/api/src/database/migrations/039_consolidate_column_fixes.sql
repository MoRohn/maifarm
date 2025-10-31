-- ============================================
-- Migration 039: Consolidate All Column Fixes
-- ============================================
-- This migration ensures all required columns exist across all tables
-- Consolidates fixes from emergency patches

-- Metrics table
ALTER TABLE metrics
ADD COLUMN IF NOT EXISTS prompt_cost NUMERIC(10,6) DEFAULT 0;

-- Token Usage table
ALTER TABLE token_usage
ADD COLUMN IF NOT EXISTS completion_cost NUMERIC(10,6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS estimated_local_cost NUMERIC(10,6) DEFAULT 0;

-- GoWild Sessions table
ALTER TABLE gowild_sessions
ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Ensure all indexes exist
CREATE INDEX IF NOT EXISTS idx_metrics_prompt_cost ON metrics(prompt_cost);
CREATE INDEX IF NOT EXISTS idx_token_usage_completion_cost ON token_usage(completion_cost);
CREATE INDEX IF NOT EXISTS idx_gowild_sessions_farm_id ON gowild_sessions(farm_id);
CREATE INDEX IF NOT EXISTS idx_gowild_sessions_started_at ON gowild_sessions(started_at);

-- Add comment for documentation
COMMENT ON COLUMN metrics.prompt_cost IS 'Cost of prompts for AI model calls';
COMMENT ON COLUMN token_usage.completion_cost IS 'Cost of completions for AI model calls';
COMMENT ON COLUMN token_usage.estimated_local_cost IS 'Estimated cost for local compute resources';
COMMENT ON COLUMN gowild_sessions.farm_id IS 'Reference to the farm running this GoWild session';
COMMENT ON COLUMN gowild_sessions.started_at IS 'Timestamp when the GoWild session started';