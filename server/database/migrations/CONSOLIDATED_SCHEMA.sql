-- ============================================
-- MAIFARM CONSOLIDATED DATABASE SCHEMA v2.0
-- This single migration replaces all 38+ migration files
-- Includes all tables, indexes, constraints, and functions
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    roles TEXT[] DEFAULT ARRAY['user'],
    permissions TEXT[] DEFAULT '{}'::TEXT[],
    mfa_secret VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System user for automated operations
INSERT INTO users (id, email, username, password_hash, roles, permissions)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'system@maifarm.local',
    'system',
    '$2b$10$SYSTEM.USER.NOT.FOR.LOGIN',
    ARRAY['system'],
    ARRAY['*']
) ON CONFLICT (id) DO NOTHING;

-- Farms table
CREATE TABLE IF NOT EXISTS farms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'collaborative',
    status VARCHAR(50) NOT NULL DEFAULT 'idle',
    provider VARCHAR(50) DEFAULT 'claude',
    orchestrator_type VARCHAR(50) DEFAULT 'tmux',

    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    metrics JSONB NOT NULL DEFAULT '{}',
    tags TEXT[] DEFAULT '{}'::TEXT[],

    -- Session management
    tmux_session VARCHAR(255),
    session_name VARCHAR(255),
    workspace_path TEXT,
    instance_id UUID,
    owner_pid INTEGER,

    -- Lifecycle tracking
    last_heartbeat TIMESTAMP,
    orphaned_at TIMESTAMP,
    recovery_attempted BOOLEAN DEFAULT FALSE,
    persist_in_background BOOLEAN DEFAULT FALSE,

    -- Relationships
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES users(id),
    seed_id UUID,
    source_seed_id UUID,
    harvest_id UUID,

    -- Template tracking
    farmer_template_id VARCHAR(255),
    farmer_template_name VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Constraints
    CONSTRAINT farms_status_check CHECK (status IN (
        'idle', 'launching', 'active', 'running', 'paused',
        'harvesting', 'completed', 'failed', 'terminated',
        'preparing', 'stopped', 'deleted', 'orphaned'
    )),
    CONSTRAINT farms_type_check CHECK (type IN (
        'sequential', 'collaborative', 'autonomous', 'gowild', 'quick-task'
    ))
);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'primary',
    status VARCHAR(50) NOT NULL DEFAULT 'idle',

    -- Capabilities & Resources
    capabilities TEXT[] DEFAULT '{}'::TEXT[],
    resources JSONB NOT NULL DEFAULT '{"cpu": 1, "memory": 1024}',
    metrics JSONB NOT NULL DEFAULT '{}',
    config JSONB NOT NULL DEFAULT '{}',

    -- Health & Monitoring
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    health_status VARCHAR(50) DEFAULT 'healthy',
    recovery_attempts INTEGER DEFAULT 0,

    -- Session management
    tmux_session VARCHAR(255),
    tmux_pane VARCHAR(50),
    pane_index INTEGER,

    -- AI-specific features
    thinking_level VARCHAR(50),
    thinking_auto_escalate BOOLEAN DEFAULT FALSE,
    thinking_complexity_score INTEGER,
    provider VARCHAR(50) DEFAULT 'claude',
    model VARCHAR(100),

    -- Tracking
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT agents_type_check CHECK (type IN ('primary', 'secondary', 'specialized', 'coordinator')),
    CONSTRAINT agents_status_check CHECK (status IN (
        'idle', 'initializing', 'active', 'working', 'busy',
        'completed', 'paused', 'error', 'failed', 'terminating',
        'terminated', 'processing', 'starting', 'ready',
        'disconnected', 'shutting_down', 'recovering'
    ))
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

    -- Task details
    type VARCHAR(100) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'queued',

    -- Data
    payload JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    error JSONB,
    metadata JSONB DEFAULT '{}',

    -- Execution control
    dependencies UUID[] DEFAULT '{}'::UUID[],
    retries INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout INTEGER DEFAULT 300000,
    response_time INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT tasks_status_check CHECK (status IN (
        'queued', 'assigned', 'processing', 'completed', 'failed', 'cancelled', 'timeout'
    ))
);

-- Harvests table
CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    farm_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',

    -- Content
    summary JSONB DEFAULT '{}',
    results JSONB DEFAULT '[]',
    insights JSONB DEFAULT '[]',
    yield JSONB DEFAULT '[]',
    quality JSONB DEFAULT '{}',

    -- Metadata
    tags TEXT[] DEFAULT '{}'::TEXT[],
    metadata JSONB DEFAULT '{}',
    export_formats TEXT[] DEFAULT ARRAY['json', 'markdown', 'pdf'],

    -- Template tracking
    farmer_template_id VARCHAR(255),
    farmer_template_name VARCHAR(255),

    -- Tracking
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    -- Constraints
    CONSTRAINT harvests_status_check CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'archived'
    ))
);

-- Seeds table
CREATE TABLE IF NOT EXISTS seeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'template',
    category VARCHAR(100),

    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    yaml_content TEXT,
    context_files TEXT[],

    -- Metadata
    tags TEXT[] DEFAULT '{}'::TEXT[],
    metadata JSONB DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2),

    -- Relationships
    parent_seed_id UUID REFERENCES seeds(id),
    harvest_id UUID REFERENCES harvests(id),
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES users(id),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,

    -- Constraints
    CONSTRAINT seeds_type_check CHECK (type IN (
        'template', 'harvest', 'custom', 'system', 'community'
    ))
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service VARCHAR(100) NOT NULL,
    key_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,

    -- Usage tracking
    last_used_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    -- Unique constraint per service
    CONSTRAINT unique_active_key_per_service UNIQUE (service, is_active)
);

-- ============================================
-- MONITORING & ANALYTICS TABLES
-- ============================================

-- Metrics table
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    source VARCHAR(100),

    -- Context
    entity_type VARCHAR(50),
    entity_id UUID,
    metadata JSONB DEFAULT '{}',

    -- Status
    status VARCHAR(50) DEFAULT 'active',
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT alerts_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT alerts_status_check CHECK (status IN ('active', 'acknowledged', 'resolved', 'ignored'))
);

-- Provider metrics table
CREATE TABLE IF NOT EXISTS provider_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_cost DECIMAL(10,6) DEFAULT 0,
    average_latency INTEGER DEFAULT 0,
    error_rate DECIMAL(5,2) DEFAULT 0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Token usage table
CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    provider VARCHAR(50),
    model VARCHAR(100),

    -- Usage data
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost DECIMAL(10,6) DEFAULT 0,

    -- Context
    request_type VARCHAR(100),
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SESSION & STATE MANAGEMENT TABLES
-- ============================================

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    data JSONB DEFAULT '{}',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tmux sessions table
CREATE TABLE IF NOT EXISTS tmux_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_name VARCHAR(255) UNIQUE NOT NULL,
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active',
    window_count INTEGER DEFAULT 1,
    pane_count INTEGER DEFAULT 1,
    owner_pid INTEGER,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT tmux_status_check CHECK (status IN (
        'active', 'orphaned', 'terminated', 'recovering'
    ))
);

-- Farm lifecycle events table
CREATE TABLE IF NOT EXISTS farm_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT lifecycle_event_type_check CHECK (event_type IN (
        'created', 'launched', 'activated', 'paused', 'resumed',
        'harvesting', 'completed', 'failed', 'terminated',
        'orphaned', 'recovered', 'heartbeat', 'timeout'
    ))
);

-- State coordination table
CREATE TABLE IF NOT EXISTS state_entities (
    id UUID PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    status VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- BARN & WORKSPACE TABLES
-- ============================================

-- Barn items table
CREATE TABLE IF NOT EXISTS barn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(100),

    -- Content
    file_path TEXT,
    content_hash VARCHAR(64),
    size_bytes BIGINT,
    mime_type VARCHAR(100),

    -- Metadata
    tags TEXT[] DEFAULT '{}'::TEXT[],
    metadata JSONB DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,

    -- Relationships
    harvest_id UUID REFERENCES harvests(id),
    farm_id UUID REFERENCES farms(id),
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES users(id),

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP,

    -- Constraints
    CONSTRAINT barn_items_type_check CHECK (type IN (
        'code', 'document', 'data', 'model', 'config', 'template', 'other'
    ))
);

-- Barn sync log table
CREATE TABLE IF NOT EXISTS barn_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES barn_items(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    source_path TEXT,
    destination_path TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    CONSTRAINT sync_action_check CHECK (action IN (
        'upload', 'download', 'sync', 'delete', 'move', 'copy'
    )),
    CONSTRAINT sync_status_check CHECK (status IN (
        'pending', 'in_progress', 'completed', 'failed'
    ))
);

-- ============================================
-- SECURITY & AUDIT TABLES
-- ============================================

-- Security audit log
CREATE TABLE IF NOT EXISTS security_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    user_id UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,

    -- Event details
    resource_type VARCHAR(50),
    resource_id UUID,
    action VARCHAR(100),
    result VARCHAR(50),

    -- Context
    metadata JSONB DEFAULT '{}',
    error_message TEXT,

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT audit_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ERROR TRACKING TABLE (NEW)
-- ============================================

CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_code INTEGER NOT NULL,
    error_message TEXT NOT NULL,
    error_severity VARCHAR(20) NOT NULL,
    error_context JSONB DEFAULT '{}',
    stack_trace TEXT,

    -- Context
    entity_type VARCHAR(50),
    entity_id UUID,
    user_id UUID REFERENCES users(id),
    session_id UUID REFERENCES sessions(id),

    -- Metadata
    is_retryable BOOLEAN DEFAULT FALSE,
    retry_count INTEGER DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT error_severity_check CHECK (error_severity IN ('low', 'medium', 'high', 'critical'))
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_roles ON users USING GIN(roles);

-- Farms indexes
CREATE INDEX idx_farms_status ON farms(status);
CREATE INDEX idx_farms_created_by ON farms(created_by);
CREATE INDEX idx_farms_created_at ON farms(created_at DESC);
CREATE INDEX idx_farms_tmux_session ON farms(tmux_session);
CREATE INDEX idx_farms_heartbeat ON farms(last_heartbeat);
CREATE INDEX idx_farms_orphaned ON farms(orphaned_at) WHERE orphaned_at IS NOT NULL;
CREATE INDEX idx_farms_active ON farms(status) WHERE status IN ('active', 'running', 'launching');
CREATE INDEX idx_farms_harvest ON farms(harvest_id) WHERE harvest_id IS NOT NULL;

-- Agents indexes
CREATE INDEX idx_agents_farm_id ON agents(farm_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_farm_status ON agents(farm_id, status);
CREATE INDEX idx_agents_last_heartbeat ON agents(last_heartbeat);
CREATE INDEX idx_agents_health_status ON agents(health_status);
CREATE INDEX idx_agents_active ON agents(status) WHERE status IN ('active', 'working', 'busy');

-- Tasks indexes
CREATE INDEX idx_tasks_farm_id ON tasks(farm_id);
CREATE INDEX idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_farm_status_priority ON tasks(farm_id, status, priority);
CREATE INDEX idx_tasks_pending ON tasks(status) WHERE status IN ('queued', 'assigned');

-- Harvests indexes
CREATE INDEX idx_harvests_farm_id ON harvests(farm_id);
CREATE INDEX idx_harvests_status ON harvests(status);
CREATE INDEX idx_harvests_created_at ON harvests(created_at DESC);

-- Seeds indexes
CREATE INDEX idx_seeds_category ON seeds(category);
CREATE INDEX idx_seeds_type ON seeds(type);
CREATE INDEX idx_seeds_usage ON seeds(usage_count DESC);

-- Metrics indexes
CREATE INDEX idx_metrics_entity ON metrics(entity_type, entity_id);
CREATE INDEX idx_metrics_type ON metrics(metric_type);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp DESC);

-- Alerts indexes
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_entity ON alerts(entity_type, entity_id);

-- Token usage indexes
CREATE INDEX idx_token_usage_farm ON token_usage(farm_id);
CREATE INDEX idx_token_usage_agent ON token_usage(agent_id);
CREATE INDEX idx_token_usage_created ON token_usage(created_at DESC);

-- Sessions indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Tmux sessions indexes
CREATE INDEX idx_tmux_sessions_farm_id ON tmux_sessions(farm_id);
CREATE INDEX idx_tmux_sessions_status ON tmux_sessions(status);
CREATE INDEX idx_tmux_sessions_heartbeat ON tmux_sessions(last_heartbeat);

-- Lifecycle events indexes
CREATE INDEX idx_lifecycle_events_farm_id ON farm_lifecycle_events(farm_id);
CREATE INDEX idx_lifecycle_events_type ON farm_lifecycle_events(event_type);
CREATE INDEX idx_lifecycle_events_created ON farm_lifecycle_events(created_at DESC);

-- State entities indexes
CREATE INDEX idx_state_entities_type ON state_entities(entity_type);
CREATE INDEX idx_state_entities_status ON state_entities(status);
CREATE INDEX idx_state_entities_updated ON state_entities(updated_at DESC);

-- Barn items indexes
CREATE INDEX idx_barn_items_type ON barn_items(type);
CREATE INDEX idx_barn_items_category ON barn_items(category);
CREATE INDEX idx_barn_items_harvest ON barn_items(harvest_id);
CREATE INDEX idx_barn_items_farm ON barn_items(farm_id);

-- Security audit indexes
CREATE INDEX idx_security_audits_user ON security_audits(user_id);
CREATE INDEX idx_security_audits_type ON security_audits(event_type);
CREATE INDEX idx_security_audits_created ON security_audits(created_at DESC);

-- Error logs indexes
CREATE INDEX idx_error_logs_code ON error_logs(error_code);
CREATE INDEX idx_error_logs_severity ON error_logs(error_severity);
CREATE INDEX idx_error_logs_entity ON error_logs(entity_type, entity_id);
CREATE INDEX idx_error_logs_unresolved ON error_logs(resolved) WHERE resolved = FALSE;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_farms_updated_at BEFORE UPDATE ON farms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_harvests_updated_at BEFORE UPDATE ON harvests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seeds_updated_at BEFORE UPDATE ON seeds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tmux_sessions_updated_at BEFORE UPDATE ON tmux_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_state_entities_updated_at BEFORE UPDATE ON state_entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_barn_items_updated_at BEFORE UPDATE ON barn_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mark this migration as applied
INSERT INTO schema_migrations (version, name)
VALUES (1000, 'CONSOLIDATED_SCHEMA_V2')
ON CONFLICT (version) DO NOTHING;

-- ============================================
-- NOTES
-- ============================================
-- This consolidated schema includes:
-- 1. All core tables with proper constraints
-- 2. Complete monitoring and analytics tables
-- 3. Session and state management
-- 4. Barn and workspace tracking
-- 5. Security and audit logging
-- 6. Error tracking (NEW)
-- 7. Comprehensive indexes for performance
-- 8. Update triggers for all tables
-- 9. Migration tracking
--
-- To apply this migration:
-- 1. Backup existing database
-- 2. Run this script in a transaction
-- 3. Verify all tables and indexes created
-- 4. Update application to use new schema
-- ============================================