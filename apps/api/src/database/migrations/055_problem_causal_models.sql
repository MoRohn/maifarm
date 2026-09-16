-- Migration 055: Problem Models and Causal Models
--
-- Implements storage for:
-- 1. Model-First Reasoning (arxiv 2512.14474) - Problem Models
-- 2. DEMOCRITUS Large Causal Models (arxiv 2512.07796) - Causal Models
--
-- These tables support the MODELING phase in the farm launch pipeline.

-- =============================================================================
-- PROBLEM MODELS TABLE (Model-First Reasoning)
-- =============================================================================
-- Stores explicit problem representations with entities, variables, actions,
-- constraints, and goals. Generated during MODELING phase before agent execution.

CREATE TABLE IF NOT EXISTS problem_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,

    -- Model version (incremented on updates)
    version INTEGER NOT NULL DEFAULT 1,

    -- Problem domain entities (files, functions, services, etc.)
    -- Array of ProblemEntity objects
    entities JSONB NOT NULL DEFAULT '[]',

    -- State variables to track during execution
    -- Array of ProblemVariable objects
    variables JSONB NOT NULL DEFAULT '[]',

    -- Possible actions/operations
    -- Array of ProblemAction objects with preconditions and effects
    actions JSONB NOT NULL DEFAULT '[]',

    -- Constraints on the problem (temporal, resource, logical, dependency)
    -- Array of ProblemConstraint objects
    constraints JSONB NOT NULL DEFAULT '[]',

    -- Success criteria / goals
    -- Array of ProblemGoal objects with conditions
    goals JSONB NOT NULL DEFAULT '[]',

    -- Verification status
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_score DECIMAL(5, 4),  -- 0.0000 to 1.0000
    verification_details JSONB DEFAULT '{}',

    -- Source information
    source_prompt TEXT,
    generated_by VARCHAR(50),  -- 'claude', 'openai', 'ollama'
    generated_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- CAUSAL MODELS TABLE (DEMOCRITUS-inspired)
-- =============================================================================
-- Stores causal relationships extracted from prompts for intelligent task
-- ordering and dependency management. Uses a 6-module pipeline.

CREATE TABLE IF NOT EXISTS causal_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,

    -- Link to associated problem model (optional)
    problem_model_id UUID REFERENCES problem_models(id) ON DELETE SET NULL,

    -- Model version
    version INTEGER NOT NULL DEFAULT 1,

    -- Causal triples: cause → relationship → effect
    -- Array of CausalTriple objects with confidence scores
    triples JSONB NOT NULL DEFAULT '[]',

    -- Graph structure
    -- Array of CausalNode objects
    graph_nodes JSONB NOT NULL DEFAULT '[]',
    -- Array of CausalEdge objects
    graph_edges JSONB NOT NULL DEFAULT '[]',

    -- Topological ordering of tasks (for execution sequence)
    topological_order TEXT[] NOT NULL DEFAULT '{}',

    -- Whether the graph is a DAG (no cycles)
    is_dag BOOLEAN NOT NULL DEFAULT TRUE,

    -- Detected cycles (if any)
    cycles JSONB DEFAULT '[]',

    -- Critical path through the graph
    critical_path TEXT[] DEFAULT '{}',

    -- Graph statistics
    graph_stats JSONB DEFAULT '{}',

    -- Conflict tracking
    -- Array of CausalConflict objects
    conflicts JSONB NOT NULL DEFAULT '[]',
    conflict_resolution_status VARCHAR(50) NOT NULL DEFAULT 'pending',

    -- Source information
    source_prompt TEXT,
    extracted_by VARCHAR(50),  -- 'claude', 'openai', 'ollama'
    extracted_at TIMESTAMP WITH TIME ZONE,

    -- Pipeline results for debugging
    pipeline_results JSONB DEFAULT '{}',

    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT causal_conflict_status_check CHECK (conflict_resolution_status IN (
        'pending', 'in_progress', 'resolved', 'manual_review'
    ))
);

-- =============================================================================
-- PROBLEM MODEL OUTPUTS TABLE
-- =============================================================================
-- Tracks outputs from agents for verification against problem models.

CREATE TABLE IF NOT EXISTS problem_model_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_model_id UUID NOT NULL REFERENCES problem_models(id) ON DELETE CASCADE,

    -- Agent that produced this output (optional)
    agent_id UUID,  -- Can't reference agents table as it may not exist

    -- Output classification
    output_type VARCHAR(50) NOT NULL,  -- 'file', 'code', 'command', 'message', 'artifact'

    -- Output content
    content JSONB NOT NULL DEFAULT '{}',

    -- Verification results
    conforms_to_model BOOLEAN,
    verification_score DECIMAL(5, 4),
    violations JSONB DEFAULT '[]',  -- Array of ConstraintViolation objects

    -- Actions claimed to be completed by this output
    completed_actions TEXT[] DEFAULT '{}',

    -- Goals claimed to be achieved by this output
    achieved_goals TEXT[] DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- CAUSAL MODEL EVENTS TABLE
-- =============================================================================
-- Tracks events during causal model processing for debugging/monitoring.

CREATE TABLE IF NOT EXISTS causal_model_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    causal_model_id UUID REFERENCES causal_models(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,

    -- Event type
    event_type VARCHAR(50) NOT NULL,

    -- Event data
    data JSONB DEFAULT '{}',

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Problem models indexes
CREATE INDEX IF NOT EXISTS idx_problem_models_farm_id
    ON problem_models(farm_id);

CREATE INDEX IF NOT EXISTS idx_problem_models_created_at
    ON problem_models(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_problem_models_verified
    ON problem_models(verified);

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_problem_models_entities_gin
    ON problem_models USING GIN (entities);

CREATE INDEX IF NOT EXISTS idx_problem_models_actions_gin
    ON problem_models USING GIN (actions);

-- Causal models indexes
CREATE INDEX IF NOT EXISTS idx_causal_models_farm_id
    ON causal_models(farm_id);

CREATE INDEX IF NOT EXISTS idx_causal_models_problem_model_id
    ON causal_models(problem_model_id);

CREATE INDEX IF NOT EXISTS idx_causal_models_created_at
    ON causal_models(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_causal_models_conflict_status
    ON causal_models(conflict_resolution_status);

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_causal_models_triples_gin
    ON causal_models USING GIN (triples);

CREATE INDEX IF NOT EXISTS idx_causal_models_conflicts_gin
    ON causal_models USING GIN (conflicts);

-- Problem model outputs indexes
CREATE INDEX IF NOT EXISTS idx_problem_outputs_model_id
    ON problem_model_outputs(problem_model_id);

CREATE INDEX IF NOT EXISTS idx_problem_outputs_agent_id
    ON problem_model_outputs(agent_id);

CREATE INDEX IF NOT EXISTS idx_problem_outputs_conforms
    ON problem_model_outputs(conforms_to_model);

-- Causal model events indexes
CREATE INDEX IF NOT EXISTS idx_causal_events_model_id
    ON causal_model_events(causal_model_id);

CREATE INDEX IF NOT EXISTS idx_causal_events_farm_id
    ON causal_model_events(farm_id);

CREATE INDEX IF NOT EXISTS idx_causal_events_type
    ON causal_model_events(event_type);

-- =============================================================================
-- UPDATE TRIGGER
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_model_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for problem_models
DROP TRIGGER IF EXISTS trigger_problem_models_updated_at ON problem_models;
CREATE TRIGGER trigger_problem_models_updated_at
    BEFORE UPDATE ON problem_models
    FOR EACH ROW
    EXECUTE FUNCTION update_model_timestamp();

-- Trigger for causal_models
DROP TRIGGER IF EXISTS trigger_causal_models_updated_at ON causal_models;
CREATE TRIGGER trigger_causal_models_updated_at
    BEFORE UPDATE ON causal_models
    FOR EACH ROW
    EXECUTE FUNCTION update_model_timestamp();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE problem_models IS 'Explicit problem representations for Model-First Reasoning (arxiv 2512.14474)';
COMMENT ON TABLE causal_models IS 'Causal relationship graphs inspired by DEMOCRITUS (arxiv 2512.07796)';
COMMENT ON TABLE problem_model_outputs IS 'Agent outputs for verification against problem models';
COMMENT ON TABLE causal_model_events IS 'Events during causal model processing for debugging';

COMMENT ON COLUMN problem_models.entities IS 'Array of ProblemEntity objects representing domain objects';
COMMENT ON COLUMN problem_models.variables IS 'Array of ProblemVariable objects for state tracking';
COMMENT ON COLUMN problem_models.actions IS 'Array of ProblemAction objects with preconditions/effects';
COMMENT ON COLUMN problem_models.constraints IS 'Array of ProblemConstraint objects (temporal, resource, etc.)';
COMMENT ON COLUMN problem_models.goals IS 'Array of ProblemGoal objects with success conditions';

COMMENT ON COLUMN causal_models.triples IS 'Array of CausalTriple objects: cause → relationship → effect';
COMMENT ON COLUMN causal_models.topological_order IS 'Task execution order from topological sort';
COMMENT ON COLUMN causal_models.conflicts IS 'Array of CausalConflict objects with resolution status';
