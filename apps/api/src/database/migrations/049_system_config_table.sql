-- Migration 049: System Configuration Table
-- Created: 2025-11-03
-- Description: Create system_config table for storing system-wide configuration values

BEGIN;

-- Create system_config table for storing various system configurations
CREATE TABLE IF NOT EXISTS system_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  category VARCHAR(100) DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique key per category
  CONSTRAINT unique_key_category UNIQUE (key, category)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);
CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config(category);
CREATE INDEX IF NOT EXISTS idx_system_config_key_category ON system_config(key, category);

-- Add comment
COMMENT ON TABLE system_config IS 'System-wide configuration key-value store';
COMMENT ON COLUMN system_config.key IS 'Configuration key identifier';
COMMENT ON COLUMN system_config.value IS 'Configuration value (stored as JSON or text)';
COMMENT ON COLUMN system_config.category IS 'Configuration category for grouping';

COMMIT;
