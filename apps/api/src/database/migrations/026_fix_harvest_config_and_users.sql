-- Migration: Fix missing config column in harvests table and create default user
-- Created: 2025-08-29
-- Purpose: Fix GoWild functionality by adding missing columns and default user

-- Add config column to harvests table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='harvests' AND column_name='config') THEN
        ALTER TABLE harvests ADD COLUMN config JSONB DEFAULT '{}';
    END IF;
END $$;

-- Create default system user if it doesn't exist
INSERT INTO users (id, username, email, password_hash, roles, metadata, permissions)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'system',
    'system@maifarm.local',
    'no-login', -- This is a system user, not for authentication
    ARRAY['system'],
    '{"type": "system", "description": "Default system user for automated processes"}',
    ARRAY['admin', 'read', 'write', 'delete']
)
ON CONFLICT (id) DO NOTHING;

-- Update existing records with null user_id to use the system user
UPDATE barn_items 
SET user_id = '00000000-0000-0000-0000-000000000000'
WHERE user_id IS NULL;

-- Update existing harvests with null created_by to use the system user
UPDATE harvests 
SET created_by = '00000000-0000-0000-0000-000000000000'
WHERE created_by IS NULL;

-- Set default value for user_id in barn_items to system user
ALTER TABLE barn_items 
ALTER COLUMN user_id 
SET DEFAULT '00000000-0000-0000-0000-000000000000';

-- Set default value for created_by in harvests to system user
ALTER TABLE harvests
ALTER COLUMN created_by
SET DEFAULT '00000000-0000-0000-0000-000000000000';