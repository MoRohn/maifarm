-- ============================================
-- Migration 001: Core Schema
-- ============================================
-- This migration creates the core tables for the MaiFarm system
-- Consolidates: 001_initial_schema, 016_system_users, 017_fix_created_by

BEGIN;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

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

-- ============================================
-- FARMS
-- ============================================

CREATE TABLE IF NOT EXISTS farms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
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
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000',
    seed_id UUID, -- Will be foreign key after seeds table
    source_seed_id UUID, -- For farms created from seeds
    
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
        'preparing', 'stopped', 'deleted'
    ))
);

-- ============================================
-- AGENTS
-- ============================================

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
    
    -- Session management
    tmux_session VARCHAR(255),
    tmux_pane VARCHAR(50),
    
    -- Thinking strategy support
    thinking_level VARCHAR(50),
    thinking_auto_escalate BOOLEAN DEFAULT FALSE,
    thinking_complexity_score INTEGER,
    
    -- Tracking
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT agents_type_check CHECK (type IN ('primary', 'secondary', 'specialized')),
    CONSTRAINT check_agents_valid_status CHECK (status IN (
        'idle', 'initializing', 'active', 'working', 'busy',
        'completed', 'paused', 'error', 'failed', 'terminating',
        'terminated', 'processing', 'starting', 'ready',
        'disconnected', 'shutting_down'
    ))
);

-- ============================================
-- TASKS
-- ============================================

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
    timeout INTEGER DEFAULT 300000, -- milliseconds
    response_time INTEGER, -- actual execution time
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT tasks_status_check CHECK (status IN (
        'queued', 'assigned', 'processing', 'completed', 'failed', 'cancelled'
    ))
);

-- ============================================
-- SESSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    data JSONB DEFAULT '{}',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SETTINGS
-- ============================================

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
-- TMUX SESSIONS TRACKING
-- ============================================

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

-- ============================================
-- FARM LIFECYCLE EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS farm_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT lifecycle_event_type_check CHECK (event_type IN (
        'created', 'launched', 'activated', 'paused', 'resumed',
        'harvesting', 'completed', 'failed', 'terminated',
        'orphaned', 'recovered', 'heartbeat'
    ))
);

-- ============================================
-- INDEXES FOR CORE TABLES
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

-- Sessions indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Settings index
CREATE INDEX idx_settings_key ON settings(key);
CREATE INDEX idx_settings_category ON settings(category);

-- Tmux sessions indexes
CREATE INDEX idx_tmux_sessions_farm_id ON tmux_sessions(farm_id);
CREATE INDEX idx_tmux_sessions_status ON tmux_sessions(status);
CREATE INDEX idx_tmux_sessions_heartbeat ON tmux_sessions(last_heartbeat);

-- Lifecycle events indexes
CREATE INDEX idx_lifecycle_events_farm_id ON farm_lifecycle_events(farm_id);
CREATE INDEX idx_lifecycle_events_type ON farm_lifecycle_events(event_type);
CREATE INDEX idx_lifecycle_events_created ON farm_lifecycle_events(created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_farms_updated_at BEFORE UPDATE ON farms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tmux_sessions_updated_at BEFORE UPDATE ON tmux_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;