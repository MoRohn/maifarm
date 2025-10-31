-- Fix missing columns in MaiFarm database
-- Run this script to resolve migration issues

-- Fix api_keys table
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS key_hash VARCHAR(255);

-- Fix provider_metrics table
ALTER TABLE provider_metrics
ADD COLUMN IF NOT EXISTS total_requests INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_requests INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_latency DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_rate DECIMAL(5,2) DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider);
CREATE INDEX IF NOT EXISTS idx_provider_metrics_timestamp ON provider_metrics(timestamp);

-- Verify the changes
SELECT
    table_name,
    column_name,
    data_type
FROM
    information_schema.columns
WHERE
    table_schema = 'public'
    AND table_name IN ('api_keys', 'provider_metrics')
ORDER BY
    table_name,
    ordinal_position;