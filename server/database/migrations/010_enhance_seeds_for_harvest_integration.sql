-- Enhanced Seeds schema for Harvest integration
-- Migration 010: Add Harvest linking and additional prompt support

-- Add columns to link Seeds to Harvests and support additional prompts
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS harvest_id UUID REFERENCES harvests(id) ON DELETE SET NULL;
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS barn_data JSONB DEFAULT '{}';
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS additional_prompt TEXT;
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'manual';

-- Add check constraint for source_type
ALTER TABLE seeds ADD CONSTRAINT check_source_type 
    CHECK (source_type IN ('manual', 'harvest_completion', 'barn_harvest', 'template'));

-- Update the existing farms table to better support seed relationships
ALTER TABLE farms ADD COLUMN IF NOT EXISTS source_seed_id UUID REFERENCES seeds(id);

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_seeds_harvest_id ON seeds(harvest_id);
CREATE INDEX IF NOT EXISTS idx_seeds_source_type ON seeds(source_type);
CREATE INDEX IF NOT EXISTS idx_farms_source_seed_id ON farms(source_seed_id);

-- Add a function to extract YAML metadata for indexing
CREATE OR REPLACE FUNCTION extract_seed_metadata(yaml_content TEXT) 
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- This is a simple implementation - in production, you might want to use a proper YAML parser
    result := jsonb_build_object(
        'has_agents', yaml_content ILIKE '%agents:%',
        'has_steps', yaml_content ILIKE '%steps:%',
        'has_config', yaml_content ILIKE '%config:%',
        'estimated_complexity', CASE 
            WHEN length(yaml_content) > 5000 THEN 'complex'
            WHEN length(yaml_content) > 2000 THEN 'moderate' 
            ELSE 'simple' 
        END
    );
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Add generated column for searchable metadata
ALTER TABLE seeds ADD COLUMN IF NOT EXISTS yaml_metadata JSONB 
    GENERATED ALWAYS AS (extract_seed_metadata(yaml)) STORED;

-- Add index on the generated metadata column
CREATE INDEX IF NOT EXISTS idx_seeds_yaml_metadata ON seeds USING GIN (yaml_metadata);

-- Add view for easy Seed queries with Harvest information
CREATE OR REPLACE VIEW seeds_with_harvest_info AS
SELECT 
    s.*,
    h.name as harvest_name,
    h.farm_name as harvest_farm_name,
    h.type as harvest_type,
    h.created_at as harvest_created_at,
    CASE 
        WHEN s.harvest_id IS NOT NULL THEN true
        ELSE false
    END as is_harvest_derived
FROM seeds s
LEFT JOIN harvests h ON s.harvest_id = h.id;

-- Comment the new columns and view
COMMENT ON COLUMN seeds.harvest_id IS 'Reference to the harvest this seed was created from (if any)';
COMMENT ON COLUMN seeds.barn_data IS 'Additional data from the barn/harvest for context';
COMMENT ON COLUMN seeds.additional_prompt IS 'User-provided additional prompt to append to the original';
COMMENT ON COLUMN seeds.source_type IS 'How this seed was created: manual, harvest_completion, barn_harvest, template';
COMMENT ON VIEW seeds_with_harvest_info IS 'Seeds with related harvest information for easy querying';