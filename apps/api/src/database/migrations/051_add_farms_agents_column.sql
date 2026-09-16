-- Migration: Add agents JSONB column to farms table
-- Date: 2025-01-31
-- Issue: Bug #9 - farms.agents JSONB array not populated
-- This migration adds the missing agents column that the UnifiedFarmLaunchOrchestrator expects

-- Add agents column to farms table
ALTER TABLE farms
ADD COLUMN IF NOT EXISTS agents JSONB DEFAULT '[]'::jsonb;

-- Add index for better query performance on agents array
CREATE INDEX IF NOT EXISTS idx_farms_agents ON farms USING gin(agents);

-- Add comment explaining the column
COMMENT ON COLUMN farms.agents IS 'JSONB array containing denormalized agent data for quick access. Updated by UnifiedFarmLaunchOrchestrator during agent creation.';