-- Migration: Fix barn_sync_log table by adding missing items_deleted column
-- Date: 2025-01-05
-- Description: Adds items_deleted column to barn_sync_log table to fix sync logging errors

-- Add the missing items_deleted column if it doesn't exist
ALTER TABLE barn_sync_log 
ADD COLUMN IF NOT EXISTS items_deleted INTEGER DEFAULT 0;

-- Update any NULL values to 0 for consistency
UPDATE barn_sync_log 
SET items_deleted = 0 
WHERE items_deleted IS NULL;