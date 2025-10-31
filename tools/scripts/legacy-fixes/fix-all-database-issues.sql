-- Comprehensive fix for all database issues
-- This script adds all missing columns to existing tables

-- Add missing columns to api_keys table
DO $$
BEGIN
    -- Add provider column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='api_keys') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='api_keys' AND column_name='provider') THEN
        ALTER TABLE api_keys ADD COLUMN provider VARCHAR(50);
    END IF;

    -- Add encrypted_key column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='api_keys') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='api_keys' AND column_name='encrypted_key') THEN
        ALTER TABLE api_keys ADD COLUMN encrypted_key TEXT;
    END IF;

    -- Add key_hash column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='api_keys') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='api_keys' AND column_name='key_hash') THEN
        ALTER TABLE api_keys ADD COLUMN key_hash VARCHAR(255);
    END IF;
END $$;

-- Add missing columns to provider_metrics table
DO $$
BEGIN
    -- Add total_requests column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='provider_metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='provider_metrics' AND column_name='total_requests') THEN
        ALTER TABLE provider_metrics ADD COLUMN total_requests INTEGER DEFAULT 0;
    END IF;

    -- Add successful_requests column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='provider_metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='provider_metrics' AND column_name='successful_requests') THEN
        ALTER TABLE provider_metrics ADD COLUMN successful_requests INTEGER DEFAULT 0;
    END IF;

    -- Add failed_requests column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='provider_metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='provider_metrics' AND column_name='failed_requests') THEN
        ALTER TABLE provider_metrics ADD COLUMN failed_requests INTEGER DEFAULT 0;
    END IF;

    -- Add total_tokens column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='provider_metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='provider_metrics' AND column_name='total_tokens') THEN
        ALTER TABLE provider_metrics ADD COLUMN total_tokens INTEGER DEFAULT 0;
    END IF;

    -- Add total_cost column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='provider_metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='provider_metrics' AND column_name='total_cost') THEN
        ALTER TABLE provider_metrics ADD COLUMN total_cost DECIMAL(10, 6) DEFAULT 0;
    END IF;

    -- Add average_latency column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='provider_metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='provider_metrics' AND column_name='average_latency') THEN
        ALTER TABLE provider_metrics ADD COLUMN average_latency DECIMAL(10, 2) DEFAULT 0;
    END IF;

    -- Add error_rate column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='provider_metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='provider_metrics' AND column_name='error_rate') THEN
        ALTER TABLE provider_metrics ADD COLUMN error_rate DECIMAL(5, 2) DEFAULT 0;
    END IF;

    -- Add timestamp column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='provider_metrics') AND
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='provider_metrics' AND column_name='timestamp') THEN
        ALTER TABLE provider_metrics ADD COLUMN timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Ensure farms table has proper UUID generation
DO $$
BEGIN
    -- Check if farms table exists and alter id column to have default UUID
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='farms') THEN
        ALTER TABLE farms ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
END $$;

-- Create provider_metrics table if it doesn't exist
CREATE TABLE IF NOT EXISTS provider_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0,
    average_latency DECIMAL(10, 2) DEFAULT 0,
    error_rate DECIMAL(5, 2) DEFAULT 0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fix the migration tracking table
DO $$
BEGIN
    -- Ensure schema_migrations table exists
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Mark migration 000 as completed if not already done
    INSERT INTO schema_migrations (version)
    VALUES (0)
    ON CONFLICT (version) DO NOTHING;
END $$;