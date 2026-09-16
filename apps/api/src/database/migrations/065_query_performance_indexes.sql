-- Migration: 065_query_performance_indexes.sql
-- Purpose: Add composite indexes for query performance optimization
-- Created: 2026-01-10

-- =============================================================================
-- Harvests table indexes for efficient initialization and user queries
-- =============================================================================

-- Composite index for initialization queries (loadHarvests)
-- Optimizes: SELECT * FROM harvests WHERE status != 'deleted' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_harvests_status_created_at
  ON harvests(status, created_at DESC)
  WHERE status != 'deleted';

-- Composite index for user-scoped harvest queries
-- Optimizes: SELECT * FROM harvests WHERE user_id = $1 AND status != 'deleted'
CREATE INDEX IF NOT EXISTS idx_harvests_user_status_created
  ON harvests(user_id, status, created_at DESC)
  WHERE status != 'deleted';

-- =============================================================================
-- Barn items table indexes for efficient listing
-- =============================================================================

-- Partial index for non-archived barn items
-- Optimizes: SELECT * FROM barn_items WHERE archived_at IS NULL ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_barn_items_active
  ON barn_items(created_at DESC)
  WHERE archived_at IS NULL;

-- User-scoped barn items with category filtering
CREATE INDEX IF NOT EXISTS idx_barn_items_user_category_created
  ON barn_items(user_id, category, created_at DESC)
  WHERE archived_at IS NULL;

-- =============================================================================
-- Agents table indexes for farm polling
-- =============================================================================

-- Composite index for agent count and status checks during farm launch
-- Optimizes: SELECT * FROM agents WHERE farm_id = $1 AND status IN (...)
CREATE INDEX IF NOT EXISTS idx_agents_farm_status_active
  ON agents(farm_id, status)
  WHERE status IN ('active', 'working', 'ready', 'idle');

-- =============================================================================
-- Metrics table indexes for time-series aggregation
-- =============================================================================

-- Expression index for hourly aggregations (last 30 days)
-- Optimizes dashboard metrics queries
CREATE INDEX IF NOT EXISTS idx_metrics_hourly_aggregate
  ON metrics(source, (date_trunc('hour', timestamp)))
  WHERE timestamp > (CURRENT_TIMESTAMP - INTERVAL '30 days');

-- =============================================================================
-- Token usage indexes for cost tracking dashboard
-- =============================================================================

-- Expression index for daily cost aggregations
CREATE INDEX IF NOT EXISTS idx_token_usage_daily_cost
  ON token_usage(provider, (date_trunc('day', timestamp)))
  WHERE timestamp > (CURRENT_TIMESTAMP - INTERVAL '90 days');

-- =============================================================================
-- Full-text search indexes for barn catalog (if exists)
-- =============================================================================

-- Only create if barn_catalog table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'barn_catalog') THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_barn_catalog_fts
        ON barn_catalog USING GIN(to_tsvector(''english'', description))
    ';
  END IF;
END $$;
