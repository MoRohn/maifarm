-- Production Consolidated Migration
-- This migration creates all required tables for MaiFarm production deployment
-- Consolidates all previous migrations into a single optimized schema
-- Author: MaiFarm Team
-- Date: 2025

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search optimization
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For encryption functions

-- Drop existing tables if doing clean install (be careful in production!)
-- Uncomment only for clean installations
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Farms table: Central entity for all orchestration
CREATE TABLE IF NOT EXISTS farms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'idle' CHECK (status IN ('idle', 'launching', 'active', 'running', 'completed', 'failed', 'cancelled')),
    type VARCHAR(50) DEFAULT 'standard' CHECK (type IN ('standard', 'quick_task', 'go_wild', 'xenosync')),
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    ai_provider VARCHAR(50) DEFAULT 'claude',
    model_name VARCHAR(100),
    timeout_seconds INTEGER DEFAULT 3600,
    auto_harvest BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    workspace_path TEXT,
    session_name VARCHAR(100),
    owner_id UUID,
    organization_id UUID,
    tags TEXT[],
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    resource_limits JSONB DEFAULT '{}',
    cost_estimate DECIMAL(10, 4),
    actual_cost DECIMAL(10, 4)
);

CREATE INDEX IF NOT EXISTS idx_farms_status ON farms(status);
CREATE INDEX IF NOT EXISTS idx_farms_type ON farms(type);
CREATE INDEX IF NOT EXISTS idx_farms_created_at ON farms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_farms_owner ON farms(owner_id);
CREATE INDEX IF NOT EXISTS idx_farms_session ON farms(session_name);
CREATE INDEX IF NOT EXISTS idx_farms_tags ON farms USING GIN(tags);

-- Agents table: AI agents working on farms
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'claude',
    status VARCHAR(50) DEFAULT 'idle' CHECK (status IN ('idle', 'launching', 'active', 'working', 'completed', 'failed', 'recovering')),
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    tmux_pane_id VARCHAR(100),
    process_id INTEGER,
    health_status VARCHAR(50) DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    recovery_attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    output_path TEXT,
    token_usage JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    capabilities TEXT[],
    assigned_tasks UUID[]
);

CREATE INDEX IF NOT EXISTS idx_agents_farm_id ON agents(farm_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_health ON agents(health_status);
CREATE INDEX IF NOT EXISTS idx_agents_heartbeat ON agents(last_heartbeat DESC);

-- Tasks table: Individual work items
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'generic',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled', 'skipped')),
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    dependencies UUID[],
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    estimated_duration INTEGER,
    actual_duration INTEGER,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS idx_tasks_farm_id ON tasks(farm_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);

-- ============================================================================
-- HARVEST & OUTPUT TABLES
-- ============================================================================

-- Harvests table: Collection of farm outputs
CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    name VARCHAR(255),
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'collecting', 'processing', 'ready', 'failed', 'archived')),
    type VARCHAR(50) DEFAULT 'automatic',
    collection_method VARCHAR(50) DEFAULT 'graceful',
    artifacts JSONB DEFAULT '[]',
    insights JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    file_count INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    compression_ratio DECIMAL(3, 2),
    storage_location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    collected_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE,
    retention_days INTEGER DEFAULT 30,
    quality_score DECIMAL(3, 2),
    validation_status VARCHAR(50),
    tags TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_harvests_farm_id ON harvests(farm_id);
CREATE INDEX IF NOT EXISTS idx_harvests_status ON harvests(status);
CREATE INDEX IF NOT EXISTS idx_harvests_created_at ON harvests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_harvests_tags ON harvests USING GIN(tags);

-- Barn items table: Reusable artifacts
CREATE TABLE IF NOT EXISTS barn_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    harvest_id UUID REFERENCES harvests(id) ON DELETE CASCADE,
    farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'file',
    category VARCHAR(100),
    content_type VARCHAR(100),
    file_path TEXT,
    file_size BIGINT,
    checksum VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1,
    is_public BOOLEAN DEFAULT false,
    tags TEXT[],
    search_vector tsvector
);

CREATE INDEX IF NOT EXISTS idx_barn_items_harvest ON barn_items(harvest_id);
CREATE INDEX IF NOT EXISTS idx_barn_items_category ON barn_items(category);
CREATE INDEX IF NOT EXISTS idx_barn_items_type ON barn_items(type);
CREATE INDEX IF NOT EXISTS idx_barn_items_tags ON barn_items USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_barn_items_search ON barn_items USING GIN(search_vector);

-- Seeds table: Templates for farms
CREATE TABLE IF NOT EXISTS seeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    type VARCHAR(50) DEFAULT 'custom',
    category VARCHAR(100),
    config JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    version VARCHAR(20) DEFAULT '1.0.0',
    author VARCHAR(255),
    is_public BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    rating DECIMAL(2, 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE,
    deprecated_at TIMESTAMP WITH TIME ZONE,
    tags TEXT[],
    requirements JSONB DEFAULT '{}',
    examples JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_seeds_type ON seeds(type);
CREATE INDEX IF NOT EXISTS idx_seeds_category ON seeds(category);
CREATE INDEX IF NOT EXISTS idx_seeds_public ON seeds(is_public);
CREATE INDEX IF NOT EXISTS idx_seeds_tags ON seeds USING GIN(tags);

-- ============================================================================
-- MONITORING & ANALYTICS TABLES
-- ============================================================================

-- Metrics table: Time-series metrics data
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL,
    metric_data JSONB DEFAULT '{}',
    tags JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    aggregation_level VARCHAR(20) DEFAULT 'raw'
);

CREATE INDEX IF NOT EXISTS idx_metrics_entity ON metrics(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_tags ON metrics USING GIN(tags);

-- Partition metrics table by month for better performance
-- ALTER TABLE metrics PARTITION BY RANGE (timestamp);

-- Events table: System events and audit log
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50),
    entity_type VARCHAR(50),
    entity_id UUID,
    user_id UUID,
    session_id VARCHAR(100),
    event_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);

-- Alerts table: System alerts and notifications
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    source VARCHAR(100),
    entity_type VARCHAR(50),
    entity_id UUID,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    details JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    resolved_by UUID,
    auto_resolve_at TIMESTAMP WITH TIME ZONE,
    notification_sent BOOLEAN DEFAULT false,
    notification_channels TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON alerts(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

-- ============================================================================
-- SECURITY & ACCESS CONTROL TABLES
-- ============================================================================

-- Users table: System users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'operator', 'developer', 'user', 'viewer')),
    permissions JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    api_key_hash VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255),
    email_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- API keys table: API authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(10),
    provider VARCHAR(50) NOT NULL,
    permissions JSONB DEFAULT '{}',
    rate_limit INTEGER DEFAULT 100,
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- Sessions table: User sessions
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================================================
-- COST TRACKING TABLES
-- ============================================================================

-- Token usage table: Track AI token consumption
CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost_per_token DECIMAL(10, 8),
    total_cost DECIMAL(10, 4),
    currency VARCHAR(3) DEFAULT 'USD',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_token_usage_entity ON token_usage(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp DESC);

-- Cost allocations table: Track costs by project/team
CREATE TABLE IF NOT EXISTS cost_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    category VARCHAR(100),
    provider VARCHAR(50),
    total_cost DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    breakdown JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_allocations_period ON cost_allocations(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_cost_allocations_entity ON cost_allocations(entity_type, entity_id);

-- ============================================================================
-- WORKFLOW TABLES
-- ============================================================================

-- Workflows table: Workflow definitions
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) DEFAULT '1.0.0',
    type VARCHAR(50) DEFAULT 'sequential',
    definition JSONB NOT NULL,
    parameters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_template BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tags TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);
CREATE INDEX IF NOT EXISTS idx_workflows_template ON workflows(is_template);
CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows USING GIN(tags);

-- Workflow executions table: Track workflow runs
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES workflows(id),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    state JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_exec_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_farm ON workflow_executions(farm_id);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_status ON workflow_executions(status);

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

-- Schema migrations table: Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INTEGER,
    checksum VARCHAR(64)
);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically set search vectors
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector = 
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply search vector trigger to barn_items
DROP TRIGGER IF EXISTS update_barn_items_search_vector ON barn_items;
CREATE TRIGGER update_barn_items_search_vector 
    BEFORE INSERT OR UPDATE ON barn_items 
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- ============================================================================
-- INITIAL DATA & PERMISSIONS
-- ============================================================================

-- Insert migration record
INSERT INTO schema_migrations (version, checksum) 
VALUES ('000_production_consolidated', 'initial')
ON CONFLICT (version) DO NOTHING;

-- Create default admin user (update password in production!)
-- INSERT INTO users (email, username, full_name, role, email_verified, is_active)
-- VALUES ('admin@maifarm.ai', 'admin', 'System Administrator', 'admin', true, true)
-- ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- PERFORMANCE OPTIMIZATIONS
-- ============================================================================

-- Analyze tables for query optimization
ANALYZE;

-- Update table statistics
-- VACUUM ANALYZE;

-- ============================================================================
-- COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE farms IS 'Central orchestration entity for AI agent farms';
COMMENT ON TABLE agents IS 'AI agents that work on farms to complete tasks';
COMMENT ON TABLE tasks IS 'Individual work items assigned to agents';
COMMENT ON TABLE harvests IS 'Collections of outputs from completed farms';
COMMENT ON TABLE barn_items IS 'Reusable artifacts stored in the barn';
COMMENT ON TABLE seeds IS 'Templates and configurations for creating farms';
COMMENT ON TABLE metrics IS 'Time-series metrics data for monitoring';
COMMENT ON TABLE events IS 'System events and audit trail';
COMMENT ON TABLE alerts IS 'System alerts and notifications';
COMMENT ON TABLE users IS 'System users and authentication';
COMMENT ON TABLE api_keys IS 'API authentication keys';
COMMENT ON TABLE token_usage IS 'AI provider token consumption tracking';
COMMENT ON TABLE workflows IS 'Workflow definitions for complex orchestrations';
COMMENT ON TABLE schema_migrations IS 'Database migration tracking';