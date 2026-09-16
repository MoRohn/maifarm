-- Migration: 048_yield_detection_system.sql
-- Description: Create tables for real-time yield detection and artifact tracking
-- Author: MaiFarm System
-- Date: 2025

-- ============================================================================
-- Harvest Yield Items Table
-- ============================================================================

-- Drop existing table if it exists (for clean migration)
DROP TABLE IF EXISTS harvest_yield CASCADE;

-- Create harvest_yield table for real-time detected yield items
CREATE TABLE harvest_yield (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  harvest_id UUID, -- Reference to harvest, nullable since harvest might be created later
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  agent_name TEXT NOT NULL,

  -- Item classification
  type TEXT NOT NULL CHECK (type IN (
    'file', 'code', 'document', 'data', 'report',
    'test-result', 'build-artifact', 'configuration', 'diagram'
  )),

  -- Item details
  title TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL,
  content TEXT, -- Stored for small files only
  preview TEXT, -- First 500 chars or preview image

  -- Metadata (JSON for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "size": number,
  --   "language": string,
  --   "linesOfCode": number,
  --   "relevanceScore": number (0-1),
  --   "quality": "low" | "medium" | "high" | "excellent",
  --   "tags": string[],
  --   "checksum": string,
  --   "mimeType": string
  -- }

  -- Correlation data for prompt matching
  correlation_data JSONB DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "promptKeywords": string[],
  --   "matchedKeywords": string[],
  --   "context": string,
  --   "confidence": number (0-1)
  -- }

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Fast lookups by farm
CREATE INDEX idx_harvest_yield_farm ON harvest_yield(farm_id);

-- Fast lookups by harvest
CREATE INDEX idx_harvest_yield_harvest ON harvest_yield(harvest_id);

-- Fast filtering by type
CREATE INDEX idx_harvest_yield_type ON harvest_yield(type);

-- Fast sorting by creation time
CREATE INDEX idx_harvest_yield_created ON harvest_yield(created_at DESC);

-- Fast lookups by agent
CREATE INDEX idx_harvest_yield_agent ON harvest_yield(agent_id);

-- GIN indexes for JSONB search
CREATE INDEX idx_harvest_yield_metadata ON harvest_yield USING GIN (metadata);
CREATE INDEX idx_harvest_yield_correlation ON harvest_yield USING GIN (correlation_data);

-- Index for relevance score queries (using JSONB path)
CREATE INDEX idx_harvest_yield_relevance ON harvest_yield ((metadata->>'relevanceScore'));

-- Index for quality filtering
CREATE INDEX idx_harvest_yield_quality ON harvest_yield ((metadata->>'quality'));

-- ============================================================================
-- Incubation Lineage Table
-- ============================================================================

-- Drop existing view/table if it exists (view may exist from earlier migrations)
DROP VIEW IF EXISTS incubation_lineage CASCADE;
DROP TABLE IF EXISTS incubation_lineage CASCADE;

-- Create table to track incubation relationships
CREATE TABLE incubation_lineage (
  id SERIAL PRIMARY KEY,

  -- Relationship
  parent_farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  parent_harvest_id UUID, -- Reference to harvest, nullable
  child_farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
  child_harvest_id UUID, -- Reference to harvest, nullable

  -- Incubation details
  incubation_session_id UUID REFERENCES incubation_sessions(id) ON DELETE SET NULL,
  generation INTEGER DEFAULT 1,
  evolution_context TEXT, -- User-provided context for evolution

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for lineage queries
CREATE INDEX idx_incubation_lineage_parent_farm ON incubation_lineage(parent_farm_id);
CREATE INDEX idx_incubation_lineage_child_farm ON incubation_lineage(child_farm_id);
CREATE INDEX idx_incubation_lineage_parent_harvest ON incubation_lineage(parent_harvest_id);
CREATE INDEX idx_incubation_lineage_child_harvest ON incubation_lineage(child_harvest_id);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_harvest_yield_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_harvest_yield_updated_at
  BEFORE UPDATE ON harvest_yield
  FOR EACH ROW
  EXECUTE FUNCTION update_harvest_yield_updated_at();

-- ============================================================================
-- Helper Views
-- ============================================================================

-- View for high-quality yield items
CREATE OR REPLACE VIEW high_quality_yield AS
SELECT
  hy.*,
  f.name as farm_name
FROM harvest_yield hy
LEFT JOIN farms f ON hy.farm_id = f.id
WHERE (hy.metadata->>'quality')::text IN ('high', 'excellent')
  AND (hy.metadata->>'relevanceScore')::numeric > 0.7;

-- View for yield statistics by farm
CREATE OR REPLACE VIEW yield_statistics AS
SELECT
  farm_id,
  COUNT(*) as total_items,
  COUNT(DISTINCT agent_id) as contributing_agents,
  COUNT(CASE WHEN type = 'code' THEN 1 END) as code_files,
  COUNT(CASE WHEN type = 'document' THEN 1 END) as documents,
  COUNT(CASE WHEN type = 'test-result' THEN 1 END) as test_results,
  AVG((metadata->>'relevanceScore')::numeric) as avg_relevance,
  MAX((metadata->>'relevanceScore')::numeric) as max_relevance,
  SUM((metadata->>'size')::bigint) as total_size_bytes,
  MAX(created_at) as last_item_created
FROM harvest_yield
GROUP BY farm_id;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE harvest_yield IS 'Real-time detected yield items from agent activities during farm execution';
COMMENT ON COLUMN harvest_yield.type IS 'Classification of the yield item based on content and purpose';
COMMENT ON COLUMN harvest_yield.metadata IS 'Flexible JSON storage for item metadata including size, language, quality scores';
COMMENT ON COLUMN harvest_yield.correlation_data IS 'Data showing how this item correlates with the original user prompt';
COMMENT ON COLUMN harvest_yield.preview IS 'Quick preview of content for UI display without loading full content';

COMMENT ON TABLE incubation_lineage IS 'Tracks parent-child relationships between farms/harvests through incubation';
COMMENT ON COLUMN incubation_lineage.generation IS 'Generation number in the evolution tree (1 = original, 2 = first evolution, etc.)';
COMMENT ON COLUMN incubation_lineage.evolution_context IS 'User-provided context that guided this evolution';

-- ============================================================================
-- Migration Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 048_yield_detection_system completed successfully';
  RAISE NOTICE 'Created tables: harvest_yield, incubation_lineage';
  RAISE NOTICE 'Created views: high_quality_yield, yield_statistics';
  RAISE NOTICE 'Created indexes for optimal query performance';
END $$;