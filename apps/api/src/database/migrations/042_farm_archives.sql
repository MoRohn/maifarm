-- Migration 042: Farm Archives Feature
-- Adds support for archiving farms with their complete data

BEGIN;

-- Add archive fields to farms table
ALTER TABLE farms
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- Create farm_archives table for detailed archive data
CREATE TABLE IF NOT EXISTS farm_archives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,

    -- Original farm data
    farm_name VARCHAR(255) NOT NULL,
    farm_description TEXT,
    farm_type VARCHAR(50),

    -- Prompt and configuration
    original_prompt TEXT NOT NULL,
    farm_config JSONB DEFAULT '{}',

    -- Agent data
    agent_count INTEGER DEFAULT 0,
    agent_messages JSONB DEFAULT '[]', -- Array of agent conversation messages
    agent_names TEXT[] DEFAULT '{}',

    -- Outputs and results
    final_outputs JSONB DEFAULT '{}', -- Final harvest outputs
    artifacts JSONB DEFAULT '[]', -- Array of generated artifacts
    yield_items JSONB DEFAULT '[]', -- Yield items from harvest

    -- Execution metadata
    metadata JSONB DEFAULT '{}', -- Execution details, timings, resource usage
    token_usage INTEGER DEFAULT 0,
    execution_time_seconds INTEGER DEFAULT 0,
    total_cost DECIMAL(10, 4) DEFAULT 0,

    -- Archive metadata
    archived_by UUID REFERENCES users(id),
    archive_reason TEXT,
    archive_notes TEXT,
    tags TEXT[] DEFAULT '{}',

    -- Timestamps
    farm_created_at TIMESTAMPTZ,
    farm_completed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Search and categorization
    category VARCHAR(100),
    subcategory VARCHAR(100),
    keywords TEXT[] DEFAULT '{}',

    -- Usage tracking
    view_count INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    export_count INTEGER DEFAULT 0,
    last_exported_at TIMESTAMPTZ,

    -- Status
    is_public BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    quality_score DECIMAL(3, 2) -- 0.00 to 5.00 rating
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_farms_archived ON farms(archived) WHERE archived = true;
CREATE INDEX IF NOT EXISTS idx_farms_archived_at ON farms(archived_at DESC) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farm_archives_farm_id ON farm_archives(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_archives_archived_at ON farm_archives(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_farm_archives_farm_name ON farm_archives(farm_name);
CREATE INDEX IF NOT EXISTS idx_farm_archives_category ON farm_archives(category);
CREATE INDEX IF NOT EXISTS idx_farm_archives_tags ON farm_archives USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_farm_archives_keywords ON farm_archives USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_farm_archives_archived_by ON farm_archives(archived_by);
CREATE INDEX IF NOT EXISTS idx_farm_archives_is_public ON farm_archives(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_farm_archives_is_pinned ON farm_archives(is_pinned) WHERE is_pinned = true;

-- Full-text search index for prompt and outputs
CREATE INDEX IF NOT EXISTS idx_farm_archives_prompt_search
ON farm_archives USING GIN(to_tsvector('english', original_prompt));

-- Create view for archived farms with basic info
CREATE OR REPLACE VIEW archived_farms_summary AS
SELECT
    fa.id,
    fa.farm_id,
    fa.farm_name,
    fa.farm_description,
    fa.farm_type,
    fa.agent_count,
    fa.execution_time_seconds,
    fa.total_cost,
    fa.archived_at,
    fa.archived_by,
    fa.category,
    fa.tags,
    fa.is_public,
    fa.is_pinned,
    fa.quality_score,
    fa.view_count,
    u.username as archived_by_username,
    f.status as current_farm_status
FROM farm_archives fa
LEFT JOIN users u ON fa.archived_by = u.id
LEFT JOIN farms f ON fa.farm_id = f.id
ORDER BY fa.archived_at DESC;

-- Function to archive a farm
CREATE OR REPLACE FUNCTION archive_farm(
    p_farm_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_archive_id UUID;
    v_farm_record RECORD;
BEGIN
    -- Get farm data
    SELECT * INTO v_farm_record FROM farms WHERE id = p_farm_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Farm not found: %', p_farm_id;
    END IF;

    -- Check if already archived
    IF v_farm_record.archived = TRUE THEN
        RAISE EXCEPTION 'Farm is already archived: %', p_farm_id;
    END IF;

    -- Create archive entry
    INSERT INTO farm_archives (
        farm_id,
        farm_name,
        farm_description,
        farm_type,
        original_prompt,
        farm_config,
        metadata,
        archived_by,
        archive_reason,
        archive_notes,
        farm_created_at,
        farm_completed_at
    ) VALUES (
        p_farm_id,
        v_farm_record.name,
        v_farm_record.description,
        COALESCE(v_farm_record.config->>'type', 'standard'),
        COALESCE(v_farm_record.config->>'prompt', v_farm_record.description),
        v_farm_record.config,
        v_farm_record.metrics,
        p_user_id,
        p_reason,
        p_notes,
        v_farm_record.created_at,
        v_farm_record.completed_at
    ) RETURNING id INTO v_archive_id;

    -- Mark farm as archived
    UPDATE farms
    SET
        archived = TRUE,
        archived_at = CURRENT_TIMESTAMP,
        archived_by = p_user_id,
        archive_reason = p_reason
    WHERE id = p_farm_id;

    RETURN v_archive_id;
END;
$$ LANGUAGE plpgsql;

-- Function to restore an archived farm
CREATE OR REPLACE FUNCTION restore_archived_farm(
    p_farm_id UUID,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    -- Check if farm exists and is archived
    IF NOT EXISTS (SELECT 1 FROM farms WHERE id = p_farm_id AND archived = TRUE) THEN
        RAISE EXCEPTION 'Archived farm not found: %', p_farm_id;
    END IF;

    -- Restore the farm
    UPDATE farms
    SET
        archived = FALSE,
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL
    WHERE id = p_farm_id;

    -- Log the restoration in farm_archives metadata
    UPDATE farm_archives
    SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{restored}',
        jsonb_build_object(
            'restored_at', CURRENT_TIMESTAMP,
            'restored_by', p_user_id
        )
    )
    WHERE farm_id = p_farm_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update updated_at for farm_archives
CREATE OR REPLACE FUNCTION update_farm_archives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_viewed_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_farm_archives_view_trigger ON farm_archives;
CREATE TRIGGER update_farm_archives_view_trigger
    BEFORE UPDATE OF view_count ON farm_archives
    FOR EACH ROW
    EXECUTE FUNCTION update_farm_archives_updated_at();

-- Add comments for documentation
COMMENT ON TABLE farm_archives IS 'Stores archived farms with their complete execution history and outputs';
COMMENT ON COLUMN farm_archives.agent_messages IS 'JSON array of all agent conversation messages';
COMMENT ON COLUMN farm_archives.final_outputs IS 'Final harvest outputs and results';
COMMENT ON COLUMN farm_archives.metadata IS 'Execution details including timings, resource usage, and costs';

COMMIT;