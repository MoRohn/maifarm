-- 040_comprehensive_performance_indexes.sql
-- Comprehensive index optimization based on MaiFarm analysis
-- Focus on foreign keys, frequently queried columns, and query patterns

-- ============================================
-- FOREIGN KEY INDEXES (Critical for JOIN performance)
-- ============================================

-- Farms table foreign keys
CREATE INDEX IF NOT EXISTS idx_farms_created_by ON farms(created_by);
CREATE INDEX IF NOT EXISTS idx_farms_seed_id ON farms(seed_id) WHERE seed_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farms_source_seed_id ON farms(source_seed_id) WHERE source_seed_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farms_farmer_template_id ON farms(farmer_template_id) WHERE farmer_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farms_instance_id ON farms(instance_id) WHERE instance_id IS NOT NULL;

-- Sessions table foreign keys
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- API Keys table indexes (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys') THEN
        CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
        CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
        CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider);
        CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
    END IF;
END $$;

-- Seeds table indexes (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'seeds') THEN
        CREATE INDEX IF NOT EXISTS idx_seeds_created_by ON seeds(created_by);
        CREATE INDEX IF NOT EXISTS idx_seeds_visibility ON seeds(visibility);
        CREATE INDEX IF NOT EXISTS idx_seeds_created_at ON seeds(created_at);
        CREATE INDEX IF NOT EXISTS idx_seeds_public ON seeds(id) WHERE visibility = 'public';
    END IF;
END $$;

-- ============================================
-- WEBSOCKET & REAL-TIME QUERY OPTIMIZATION
-- ============================================

-- Farms real-time status queries
CREATE INDEX IF NOT EXISTS idx_farms_status_updated ON farms(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_farms_heartbeat ON farms(last_heartbeat) WHERE last_heartbeat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farms_orphaned ON farms(orphaned_at) WHERE orphaned_at IS NOT NULL;

-- Agents real-time monitoring
CREATE INDEX IF NOT EXISTS idx_agents_farm_heartbeat ON agents(farm_id, last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_agents_health ON agents(farm_id, health_status) WHERE health_status != 'healthy';
CREATE INDEX IF NOT EXISTS idx_agents_tmux ON agents(tmux_session, tmux_pane) WHERE tmux_session IS NOT NULL;

-- ============================================
-- HARVEST COLLECTION OPTIMIZATION
-- ============================================

-- Harvests table improved indexes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'harvests') THEN
        CREATE INDEX IF NOT EXISTS idx_harvests_farm_status_created ON harvests(farm_id, status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_harvests_pending ON harvests(farm_id, status) WHERE status IN ('pending', 'collecting');
        CREATE INDEX IF NOT EXISTS idx_harvests_recent ON harvests(created_at DESC) WHERE completed_at IS NOT NULL;
    END IF;
END $$;

-- Farm harvest relationship
CREATE INDEX IF NOT EXISTS idx_farms_harvest_id ON farms(harvest_id) WHERE harvest_id IS NOT NULL;

-- ============================================
-- METRICS & ANALYTICS OPTIMIZATION
-- ============================================

-- Token usage analytics
CREATE INDEX IF NOT EXISTS idx_token_usage_farm_provider ON token_usage(farm_id, provider, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent_provider ON token_usage(agent_id, provider, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_daily ON token_usage(DATE(timestamp), provider);

-- Metrics table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'metrics') THEN
        CREATE INDEX IF NOT EXISTS idx_metrics_farm_id ON metrics(farm_id);
        CREATE INDEX IF NOT EXISTS idx_metrics_agent_id ON metrics(agent_id);
        CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
        CREATE INDEX IF NOT EXISTS idx_metrics_farm_type_time ON metrics(farm_id, metric_type, timestamp DESC);
    END IF;
END $$;

-- ============================================
-- TERMINAL STREAMING OPTIMIZATION
-- ============================================

-- Terminal outputs (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'terminal_outputs') THEN
        CREATE INDEX IF NOT EXISTS idx_terminal_outputs_farm_id ON terminal_outputs(farm_id);
        CREATE INDEX IF NOT EXISTS idx_terminal_outputs_agent_id ON terminal_outputs(agent_id);
        CREATE INDEX IF NOT EXISTS idx_terminal_outputs_timestamp ON terminal_outputs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_terminal_outputs_farm_agent ON terminal_outputs(farm_id, agent_id, created_at DESC);
    END IF;
END $$;

-- ============================================
-- QUICK TASK OPTIMIZATION
-- ============================================

-- Tasks table enhanced indexes
CREATE INDEX IF NOT EXISTS idx_tasks_farm_status_priority ON tasks(farm_id, status, priority DESC) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_tasks_agent_status ON tasks(agent_id, status) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_dependencies ON tasks USING gin(dependencies) WHERE array_length(dependencies, 1) > 0;
CREATE INDEX IF NOT EXISTS idx_tasks_retry ON tasks(retries, max_retries) WHERE retries > 0;

-- ============================================
-- SECURITY & AUDIT OPTIMIZATION
-- ============================================

-- Security audits enhanced indexes
CREATE INDEX IF NOT EXISTS idx_security_audits_user_action_time ON security_audits(user_id, action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audits_failed ON security_audits(user_id, timestamp DESC) WHERE success = false;
CREATE INDEX IF NOT EXISTS idx_security_audits_ip ON security_audits((metadata->>'ip')) WHERE metadata ? 'ip';

-- ============================================
-- BARN SYNC OPTIMIZATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'barn_sync_log') THEN
        CREATE INDEX IF NOT EXISTS idx_barn_sync_log_farm_id ON barn_sync_log(farm_id);
        CREATE INDEX IF NOT EXISTS idx_barn_sync_log_status_time ON barn_sync_log(status, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_barn_sync_log_active ON barn_sync_log(farm_id, status) WHERE status = 'syncing';
    END IF;
END $$;

-- ============================================
-- COORDINATION SERVICE OPTIMIZATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coordination_events') THEN
        CREATE INDEX IF NOT EXISTS idx_coordination_events_farm_id ON coordination_events(farm_id);
        CREATE INDEX IF NOT EXISTS idx_coordination_events_agent_id ON coordination_events(agent_id);
        CREATE INDEX IF NOT EXISTS idx_coordination_events_type ON coordination_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_coordination_events_timestamp ON coordination_events(timestamp DESC);
    END IF;
END $$;

-- ============================================
-- WORKSPACE MANAGEMENT OPTIMIZATION
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces') THEN
        CREATE INDEX IF NOT EXISTS idx_workspaces_farm_id ON workspaces(farm_id);
        CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
        CREATE INDEX IF NOT EXISTS idx_workspaces_active ON workspaces(farm_id, status) WHERE status = 'active';
    END IF;
END $$;

-- ============================================
-- PARTIAL INDEXES FOR COMMON QUERIES
-- ============================================

-- Active farms with agents
CREATE INDEX IF NOT EXISTS idx_farms_active_with_session ON farms(id, tmux_session)
WHERE status IN ('active', 'running', 'launching') AND tmux_session IS NOT NULL;

-- Recently active agents
CREATE INDEX IF NOT EXISTS idx_agents_recently_active ON agents(farm_id, last_heartbeat DESC)
WHERE last_heartbeat > (CURRENT_TIMESTAMP - INTERVAL '5 minutes');

-- Pending tasks by priority
CREATE INDEX IF NOT EXISTS idx_tasks_pending_priority ON tasks(priority DESC, created_at)
WHERE status = 'queued';

-- Failed farms for recovery
CREATE INDEX IF NOT EXISTS idx_farms_failed_recovery ON farms(id, completed_at DESC)
WHERE status = 'failed' AND recovery_attempted = false;

-- ============================================
-- TEXT SEARCH OPTIMIZATION
-- ============================================

-- Farms text search
CREATE INDEX IF NOT EXISTS idx_farms_name_trgm ON farms USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_farms_description_trgm ON farms USING gin(description gin_trgm_ops) WHERE description IS NOT NULL;

-- Agents text search
CREATE INDEX IF NOT EXISTS idx_agents_name_trgm ON agents USING gin(name gin_trgm_ops);

-- ============================================
-- JSONB OPTIMIZATION
-- ============================================

-- Farms config frequently accessed keys
CREATE INDEX IF NOT EXISTS idx_farms_config_timeout ON farms((config->>'timeout')) WHERE config ? 'timeout';
CREATE INDEX IF NOT EXISTS idx_farms_config_model ON farms((config->>'model')) WHERE config ? 'model';
CREATE INDEX IF NOT EXISTS idx_farms_config_provider ON farms((config->>'provider')) WHERE config ? 'provider';

-- Agents config indexes
CREATE INDEX IF NOT EXISTS idx_agents_config_model ON agents((config->>'model')) WHERE config ? 'model';
CREATE INDEX IF NOT EXISTS idx_agents_resources_cpu ON agents((resources->>'cpu')) WHERE resources ? 'cpu';
CREATE INDEX IF NOT EXISTS idx_agents_resources_memory ON agents((resources->>'memory')) WHERE resources ? 'memory';

-- ============================================
-- CLEANUP & MAINTENANCE
-- ============================================

-- Remove any duplicate indexes (PostgreSQL will ignore if they don't exist)
DROP INDEX IF EXISTS farms_status_idx;  -- Replaced by idx_farms_status
DROP INDEX IF EXISTS agents_farm_id_idx;  -- Replaced by idx_agents_farm_id

-- Update statistics for query planner
ANALYZE farms;
ANALYZE agents;
ANALYZE tasks;
ANALYZE sessions;
ANALYZE token_usage;
ANALYZE farm_lifecycle_events;
ANALYZE security_audits;

-- Vacuum to reclaim space and update visibility map
-- (This should be done during maintenance window in production)
-- VACUUM ANALYZE;

-- ============================================
-- PERFORMANCE MONITORING QUERIES
-- ============================================

-- Create a function to check index usage (helpful for monitoring)
CREATE OR REPLACE FUNCTION check_index_usage()
RETURNS TABLE(
    schemaname TEXT,
    tablename TEXT,
    indexname TEXT,
    idx_scan BIGINT,
    idx_tup_read BIGINT,
    idx_tup_fetch BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.schemaname::TEXT,
        s.tablename::TEXT,
        s.indexname::TEXT,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch
    FROM pg_stat_user_indexes s
    WHERE s.schemaname = 'public'
    ORDER BY s.idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- Create a function to find missing indexes on foreign keys
CREATE OR REPLACE FUNCTION find_missing_fk_indexes()
RETURNS TABLE(
    table_name TEXT,
    column_name TEXT,
    constraint_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        tc.table_name::TEXT,
        kcu.column_name::TEXT,
        tc.constraint_name::TEXT
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    LEFT JOIN pg_indexes pi
        ON pi.tablename = tc.table_name
        AND pi.indexdef LIKE '%' || kcu.column_name || '%'
    WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND pi.indexname IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Add comment to track migration purpose
COMMENT ON SCHEMA public IS 'MaiFarm comprehensive performance optimization - indexes for foreign keys, common queries, and real-time operations';