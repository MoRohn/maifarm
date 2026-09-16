-- ============================================
-- Migration 067: Seeds Enhancement & Viral Seeds
-- ============================================
-- This migration enhances the Seeds system to support:
-- 1. Seeds as first-class context modules for Farms
-- 2. Mode and engine compatibility rules
-- 3. Version pinning for reproducibility
-- 4. Viral Seeds generation and snapshot storage

BEGIN;

-- ============================================
-- ENHANCED SEEDS COLUMNS
-- ============================================

-- Add seedPrompt - the canonical text injected into farm context
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS seed_prompt TEXT;

-- Add mode compatibility (which farm modes this seed supports)
-- Values: 'all' or comma-separated: 'harvest,quick_task,go_wild'
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS mode_compatibility TEXT DEFAULT 'all';

-- Add engine compatibility (which AI engines this seed supports)
-- Values: 'all' or comma-separated: 'claude,openai,grok,gpt-oss,ollama'
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS engine_compatibility TEXT DEFAULT 'all';

-- Add version for pinning/reproducibility
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add success checklist as JSONB array
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS success_checklist JSONB DEFAULT '[]';

-- Add recommended modes as JSONB array
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS recommended_modes JSONB DEFAULT '[]';

-- Add recommended engines as JSONB array
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS recommended_engines JSONB DEFAULT '[]';

-- Add safety notes for content warnings
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS safety_notes TEXT;

-- Add example outputs as JSONB array
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS example_outputs JSONB DEFAULT '[]';

-- Add sources as JSONB array (for Viral Seeds)
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]';

-- ============================================
-- FARM SEED APPLICATION
-- ============================================

-- Add applied_seed_ids to farms as JSONB array for multiple seeds
ALTER TABLE farms ADD COLUMN IF NOT EXISTS applied_seed_ids JSONB DEFAULT '[]';

-- Add applied_seed_text_snapshot to preserve historical runs
ALTER TABLE farms ADD COLUMN IF NOT EXISTS applied_seed_text_snapshot TEXT;

-- Add applied_seed_versions to track which version was used
ALTER TABLE farms ADD COLUMN IF NOT EXISTS applied_seed_versions JSONB DEFAULT '{}';

-- ============================================
-- VIRAL SEEDS SUPPORT
-- ============================================

-- Create viral_seed_snapshots table for reproducible regeneration
CREATE TABLE IF NOT EXISTS viral_seed_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Search configuration
    search_queries JSONB NOT NULL DEFAULT '[]',
    search_provider VARCHAR(100) DEFAULT 'websearch',

    -- Raw search results
    search_results JSONB NOT NULL DEFAULT '[]',

    -- Processed intents
    viral_intents JSONB NOT NULL DEFAULT '[]',

    -- Generation details
    generation_prompt_version VARCHAR(50) DEFAULT 'v1',
    model_used VARCHAR(100),

    -- Generated seeds (references to seed IDs)
    generated_seed_ids JSONB DEFAULT '[]',

    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,

    -- Performance metrics
    search_duration_ms INTEGER,
    extraction_duration_ms INTEGER,
    generation_duration_ms INTEGER,
    total_duration_ms INTEGER,

    -- Content safety
    blocked_content_count INTEGER DEFAULT 0,
    safety_flags JSONB DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    CONSTRAINT viral_snapshot_status_check CHECK (status IN (
        'pending', 'searching', 'extracting', 'generating', 'completed', 'failed'
    ))
);

-- ============================================
-- SEED APPLICATION HISTORY
-- ============================================

-- Create seed_applications table to track seed usage per farm run
CREATE TABLE IF NOT EXISTS seed_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    seed_id UUID NOT NULL REFERENCES seeds(id) ON DELETE CASCADE,

    -- Version pinning
    seed_version INTEGER NOT NULL DEFAULT 1,
    seed_prompt_snapshot TEXT NOT NULL,

    -- Application order (for multiple seeds)
    application_order INTEGER DEFAULT 0,

    -- Context injection details
    context_position VARCHAR(50) DEFAULT 'top',
    injection_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Run association
    run_number INTEGER DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint for seed per farm run
    UNIQUE(farm_id, seed_id, run_number)
);

-- ============================================
-- INDEXES
-- ============================================

-- Seeds indexes for new columns
CREATE INDEX IF NOT EXISTS idx_seeds_mode_compatibility ON seeds(mode_compatibility);
CREATE INDEX IF NOT EXISTS idx_seeds_engine_compatibility ON seeds(engine_compatibility);
CREATE INDEX IF NOT EXISTS idx_seeds_version ON seeds(version);

-- Viral snapshots indexes
CREATE INDEX IF NOT EXISTS idx_viral_snapshots_user_id ON viral_seed_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_viral_snapshots_status ON viral_seed_snapshots(status);
CREATE INDEX IF NOT EXISTS idx_viral_snapshots_created_at ON viral_seed_snapshots(created_at DESC);

-- Seed applications indexes
CREATE INDEX IF NOT EXISTS idx_seed_applications_farm_id ON seed_applications(farm_id);
CREATE INDEX IF NOT EXISTS idx_seed_applications_seed_id ON seed_applications(seed_id);
CREATE INDEX IF NOT EXISTS idx_seed_applications_farm_seed ON seed_applications(farm_id, seed_id);

-- Farms applied seeds index (GIN for JSONB array)
CREATE INDEX IF NOT EXISTS idx_farms_applied_seed_ids ON farms USING GIN(applied_seed_ids);

-- ============================================
-- UPDATE TRIGGER FOR SEEDS VERSION
-- ============================================

-- Function to auto-increment seed version on update
CREATE OR REPLACE FUNCTION increment_seed_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Only increment version if content changed
    IF OLD.seed_prompt IS DISTINCT FROM NEW.seed_prompt
       OR OLD.yaml_content IS DISTINCT FROM NEW.yaml_content
       OR OLD.description IS DISTINCT FROM NEW.description THEN
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS trigger_seed_version_increment ON seeds;
CREATE TRIGGER trigger_seed_version_increment
    BEFORE UPDATE ON seeds
    FOR EACH ROW
    EXECUTE FUNCTION increment_seed_version();

-- ============================================
-- MIGRATE EXISTING SEEDS
-- ============================================

-- Set seed_prompt from existing yaml_content initial_prompt if available
-- This is a best-effort migration - manual review may be needed
UPDATE seeds
SET seed_prompt = COALESCE(
    yaml_metadata->>'initial_prompt',
    description,
    'No seed prompt defined'
)
WHERE seed_prompt IS NULL;

COMMIT;
