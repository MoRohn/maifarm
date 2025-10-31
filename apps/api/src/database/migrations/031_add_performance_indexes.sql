-- 031_add_performance_indexes.sql
-- Add indexes for frequently queried columns to improve performance

-- Farms table indexes
CREATE INDEX IF NOT EXISTS idx_farms_status ON farms(status);
CREATE INDEX IF NOT EXISTS idx_farms_created_at ON farms(created_at);
CREATE INDEX IF NOT EXISTS idx_farms_user_id ON farms(user_id);
CREATE INDEX IF NOT EXISTS idx_farms_harvest_id ON farms(harvest_id);

-- Agents table indexes
CREATE INDEX IF NOT EXISTS idx_agents_farm_id ON agents(farm_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at);
CREATE INDEX IF NOT EXISTS idx_agents_farm_status ON agents(farm_id, status);

-- Harvests table indexes
CREATE INDEX IF NOT EXISTS idx_harvests_farm_id ON harvests(farm_id);
CREATE INDEX IF NOT EXISTS idx_harvests_status ON harvests(status);
CREATE INDEX IF NOT EXISTS idx_harvests_created_at ON harvests(created_at);
CREATE INDEX IF NOT EXISTS idx_harvests_completed_at ON harvests(completed_at);

-- Tasks table indexes (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
        CREATE INDEX IF NOT EXISTS idx_tasks_farm_id ON tasks(farm_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
        CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
    END IF;
END $$;

-- Token usage table indexes
CREATE INDEX IF NOT EXISTS idx_token_usage_farm_id ON token_usage(farm_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent_id ON token_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);

-- Farm lifecycle events indexes
CREATE INDEX IF NOT EXISTS idx_farm_lifecycle_events_farm_id ON farm_lifecycle_events(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_lifecycle_events_event_type ON farm_lifecycle_events(event_type);
CREATE INDEX IF NOT EXISTS idx_farm_lifecycle_events_created_at ON farm_lifecycle_events(created_at);

-- Security audits indexes
CREATE INDEX IF NOT EXISTS idx_security_audits_user_id ON security_audits(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audits_action ON security_audits(action);
CREATE INDEX IF NOT EXISTS idx_security_audits_timestamp ON security_audits(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_audits_success ON security_audits(success);

-- Barn sync log indexes (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'barn_sync_log') THEN
        CREATE INDEX IF NOT EXISTS idx_barn_sync_log_status ON barn_sync_log(status);
        CREATE INDEX IF NOT EXISTS idx_barn_sync_log_operation ON barn_sync_log(operation);
        CREATE INDEX IF NOT EXISTS idx_barn_sync_log_started_at ON barn_sync_log(started_at);
    END IF;
END $$;

-- Composite indexes for common join queries
CREATE INDEX IF NOT EXISTS idx_agents_farm_id_status_created ON agents(farm_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_harvests_farm_id_status_completed ON harvests(farm_id, status, completed_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_farm_agent_timestamp ON token_usage(farm_id, agent_id, timestamp);

-- Partial indexes for active records (more efficient for common queries)
CREATE INDEX IF NOT EXISTS idx_farms_active ON farms(id) WHERE status IN ('active', 'running', 'launching');
CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(id, farm_id) WHERE status IN ('active', 'working', 'busy');

-- Update statistics for query planner
ANALYZE farms;
ANALYZE agents;
ANALYZE harvests;
ANALYZE token_usage;
ANALYZE farm_lifecycle_events;
ANALYZE security_audits;