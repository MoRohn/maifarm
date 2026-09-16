-- Migration 046: Incubation System
-- Adds optional automatic output evolution with user-guided enhancements
-- Features: Auto-incubate toggle, stop/pause/play controls, lineage tracking, user context

-- Add incubation settings to farms table
ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS auto_incubate BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS parent_farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS incubation_version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS incubation_lineage UUID[] DEFAULT ARRAY[]::UUID[];

-- Add indexes for parent-child relationships
CREATE INDEX IF NOT EXISTS idx_farms_parent_farm_id ON farms(parent_farm_id);
CREATE INDEX IF NOT EXISTS idx_farms_incubation_version ON farms(incubation_version);
CREATE INDEX IF NOT EXISTS idx_farms_auto_incubate ON farms(auto_incubate) WHERE auto_incubate = true;

-- Incubation sessions table (tracks individual incubation runs)
CREATE TABLE IF NOT EXISTS incubation_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,

  -- Incubation state
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  current_stage INT DEFAULT 1,
  total_stages INT DEFAULT 5,

  -- Control state (for stop/pause/play)
  control_state VARCHAR(20) DEFAULT 'running',
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  stopped_reason TEXT,

  -- User context (optional guidance from user)
  user_context TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Inputs and outputs
  original_output JSONB NOT NULL,
  stage_outputs JSONB DEFAULT '[]'::jsonb,
  final_output JSONB,
  incubation_log JSONB,
  next_steps JSONB,

  -- Stage details (for progress tracking)
  stage_names TEXT[] DEFAULT ARRAY[
    'Contextual Grounding',
    'Gap & Potential Scan',
    'Evolutionary Leap',
    'Validation Simulation',
    'Deliverable Format'
  ],
  stage_progress JSONB DEFAULT '[]'::jsonb,

  -- Agent and execution metadata
  agent_id UUID,
  tmux_session_name VARCHAR(255),
  orchestrator_pid INT,
  prompt_used TEXT,
  token_usage JSONB,

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms BIGINT,

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT incubation_sessions_status_check CHECK (
    status IN ('pending', 'incubating', 'paused', 'stopped', 'completed', 'failed')
  ),
  CONSTRAINT incubation_sessions_control_check CHECK (
    control_state IN ('running', 'paused', 'stopped')
  ),
  CONSTRAINT incubation_sessions_stage_check CHECK (
    current_stage >= 1 AND current_stage <= total_stages
  )
);

-- Indexes for incubation sessions
CREATE INDEX IF NOT EXISTS idx_incubation_sessions_farm_id ON incubation_sessions(farm_id);
CREATE INDEX IF NOT EXISTS idx_incubation_sessions_harvest_id ON incubation_sessions(harvest_id);
CREATE INDEX IF NOT EXISTS idx_incubation_sessions_status ON incubation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_incubation_sessions_control_state ON incubation_sessions(control_state);
CREATE INDEX IF NOT EXISTS idx_incubation_sessions_user_id ON incubation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_incubation_sessions_created_at ON incubation_sessions(created_at DESC);

-- Incubation lineage view (for genealogy display)
CREATE OR REPLACE VIEW incubation_lineage AS
SELECT
  f.id as farm_id,
  f.name as farm_name,
  f.incubation_version as version,
  f.parent_farm_id,
  pf.name as parent_farm_name,
  pf.incubation_version as parent_version,
  f.created_at,
  f.status,
  f.auto_incubate,
  array_length(f.incubation_lineage, 1) as ancestors_count,
  f.incubation_lineage,
  (
    SELECT COUNT(*)
    FROM farms child
    WHERE child.parent_farm_id = f.id
  ) as children_count
FROM farms f
LEFT JOIN farms pf ON f.parent_farm_id = pf.id
WHERE f.incubation_version > 1 OR f.parent_farm_id IS NOT NULL;

-- Incubation stats view (for analytics)
CREATE OR REPLACE VIEW incubation_stats AS
SELECT
  f.id as farm_id,
  f.name as farm_name,
  f.incubation_version,
  COUNT(i.id) as total_incubations,
  COUNT(CASE WHEN i.status = 'completed' THEN 1 END) as completed_incubations,
  COUNT(CASE WHEN i.status = 'failed' THEN 1 END) as failed_incubations,
  COUNT(CASE WHEN i.control_state = 'stopped' THEN 1 END) as stopped_incubations,
  AVG(i.duration_ms) as avg_duration_ms,
  MAX(i.completed_at) as last_incubation_at,
  JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', i.id,
      'status', i.status,
      'created_at', i.created_at,
      'duration_ms', i.duration_ms,
      'has_user_context', (i.user_context IS NOT NULL AND i.user_context != '')
    ) ORDER BY i.created_at DESC
  ) FILTER (WHERE i.id IS NOT NULL) as incubation_history
FROM farms f
LEFT JOIN incubation_sessions i ON f.id = i.farm_id
GROUP BY f.id, f.name, f.incubation_version;

-- Function to get full incubation ancestry
CREATE OR REPLACE FUNCTION get_incubation_ancestors(input_farm_id UUID)
RETURNS TABLE(
  farm_id UUID,
  farm_name VARCHAR,
  version INT,
  created_at TIMESTAMPTZ,
  status VARCHAR,
  depth INT
) AS $$
WITH RECURSIVE ancestry AS (
  -- Base case: the input farm
  SELECT
    f.id,
    f.name,
    f.incubation_version,
    f.created_at,
    f.status,
    f.parent_farm_id,
    0 as depth
  FROM farms f
  WHERE f.id = input_farm_id

  UNION ALL

  -- Recursive case: get parent
  SELECT
    f.id,
    f.name,
    f.incubation_version,
    f.created_at,
    f.status,
    f.parent_farm_id,
    a.depth + 1
  FROM farms f
  INNER JOIN ancestry a ON f.id = a.parent_farm_id
  WHERE a.depth < 100 -- Prevent infinite loops
)
SELECT
  id as farm_id,
  name as farm_name,
  incubation_version as version,
  created_at,
  status,
  depth
FROM ancestry
ORDER BY depth DESC;
$$ LANGUAGE SQL STABLE;

-- Function to get incubation descendants
CREATE OR REPLACE FUNCTION get_incubation_descendants(input_farm_id UUID)
RETURNS TABLE(
  farm_id UUID,
  farm_name VARCHAR,
  version INT,
  created_at TIMESTAMPTZ,
  status VARCHAR,
  depth INT
) AS $$
WITH RECURSIVE descendants AS (
  -- Base case: the input farm
  SELECT
    f.id,
    f.name,
    f.incubation_version,
    f.created_at,
    f.status,
    0 as depth
  FROM farms f
  WHERE f.id = input_farm_id

  UNION ALL

  -- Recursive case: get children
  SELECT
    f.id,
    f.name,
    f.incubation_version,
    f.created_at,
    f.status,
    d.depth + 1
  FROM farms f
  INNER JOIN descendants d ON f.parent_farm_id = d.id
  WHERE d.depth < 100 -- Prevent infinite loops
)
SELECT
  id as farm_id,
  name as farm_name,
  incubation_version as version,
  created_at,
  status,
  depth
FROM descendants
WHERE depth > 0 -- Exclude the input farm itself
ORDER BY depth ASC, created_at ASC;
$$ LANGUAGE SQL STABLE;

-- Trigger to auto-populate incubation_lineage
CREATE OR REPLACE FUNCTION update_incubation_lineage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_farm_id IS NOT NULL THEN
    -- Get parent's lineage and append parent's ID
    SELECT COALESCE(incubation_lineage, ARRAY[]::UUID[]) || parent_farm_id
    INTO NEW.incubation_lineage
    FROM farms
    WHERE id = NEW.parent_farm_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_incubation_lineage
  BEFORE INSERT OR UPDATE OF parent_farm_id ON farms
  FOR EACH ROW
  WHEN (NEW.parent_farm_id IS NOT NULL)
  EXECUTE FUNCTION update_incubation_lineage();

-- Grant permissions
GRANT SELECT ON incubation_lineage TO PUBLIC;
GRANT SELECT ON incubation_stats TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_incubation_ancestors(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_incubation_descendants(UUID) TO PUBLIC;

-- Add comment
COMMENT ON TABLE incubation_sessions IS 'Tracks individual incubation runs with stop/pause/play controls and user context';
COMMENT ON COLUMN incubation_sessions.user_context IS 'Optional user guidance for incubation (e.g., "Focus on performance", "Add authentication")';
COMMENT ON VIEW incubation_lineage IS 'Shows parent-child relationships for incubation genealogy';
COMMENT ON VIEW incubation_stats IS 'Aggregated statistics for farm incubations';
