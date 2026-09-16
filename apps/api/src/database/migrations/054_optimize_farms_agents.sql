-- Migration 054: Optimize Farms JSONB and Status Queries
-- Created: 2025-11-14
-- Purpose: Add expression indexes for farms.agents JSONB column and status filtering
-- Impact: Faster farm listing API, improved query performance on agent counts
-- Background: Migration 051 added farms.agents JSONB column (Bug #9 fix)
-- Risk: LOW - background index creation with IF NOT EXISTS

BEGIN;

-- Expression index for agent count queries
-- Optimizes: SELECT * FROM farms WHERE jsonb_array_length(agents) > 0
CREATE INDEX IF NOT EXISTS idx_farms_agents_count
  ON farms((jsonb_array_length(agents)))
  WHERE agents != '[]'::jsonb;

-- Optimized index for active farm listing (most common query)
-- Covers: SELECT * FROM farms WHERE status != 'deleted' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_farms_not_deleted
  ON farms(created_at DESC)
  WHERE status != 'deleted';

-- Additional index for active/running farms (real-time monitoring)
CREATE INDEX IF NOT EXISTS idx_farms_active_running
  ON farms(updated_at DESC)
  WHERE status IN ('active', 'running');

-- Performance note: Expression indexes allow PostgreSQL to use these indexes
-- for computed columns without needing to recalculate on every query

COMMIT;
