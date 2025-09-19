-- Migration 037: Comprehensive fix for ALL remaining missing columns
-- This migration addresses all database column issues found in runtime

-- Fix api_keys table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys') THEN
        -- Add missing columns
        ALTER TABLE api_keys
        ADD COLUMN IF NOT EXISTS service VARCHAR(50),
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS key_encrypted TEXT,
        ADD COLUMN IF NOT EXISTS encryption_method VARCHAR(50) DEFAULT 'aes-256-gcm';
    END IF;
END $$;

-- Fix farms table - add crash_count for health monitoring
ALTER TABLE farms
ADD COLUMN IF NOT EXISTS crash_count INTEGER DEFAULT 0;

-- Fix harvests table - add completed_at
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'harvests') THEN
        ALTER TABLE harvests
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    END IF;
END $$;

-- Ensure token_usage table exists with all columns
CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    input_cost DECIMAL(10, 6) DEFAULT 0,
    output_cost DECIMAL(10, 6) DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to token_usage if it already exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'token_usage') THEN
        ALTER TABLE token_usage
        ADD COLUMN IF NOT EXISTS input_cost DECIMAL(10, 6) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS output_cost DECIMAL(10, 6) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10, 6) DEFAULT 0;
    END IF;
END $$;

-- Ensure metrics table has all required columns
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'metrics') THEN
        ALTER TABLE metrics
        ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'system',
        ADD COLUMN IF NOT EXISTS category VARCHAR(50),
        ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10, 4) DEFAULT 0;
    END IF;
END $$;

-- Fix harvest_yield table
ALTER TABLE harvest_yield
ADD COLUMN IF NOT EXISTS yield_value DECIMAL(10, 2) DEFAULT 0;

-- Fix sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_farms_crash_count ON farms(crash_count);
CREATE INDEX IF NOT EXISTS idx_harvests_completed ON harvests(completed_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_farm ON token_usage(farm_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_costs ON token_usage(total_cost);

-- Comments for documentation
COMMENT ON COLUMN api_keys.service IS 'Service/provider name for this API key';
COMMENT ON COLUMN api_keys.is_active IS 'Whether this API key is currently active';
COMMENT ON COLUMN api_keys.key_encrypted IS 'Encrypted API key value';
COMMENT ON COLUMN farms.crash_count IS 'Number of times this farm has crashed';
COMMENT ON COLUMN harvests.completed_at IS 'Timestamp when harvest was completed';