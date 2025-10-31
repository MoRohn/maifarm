-- ============================================
-- CONSOLIDATED MIGRATION: Complete MaiFarm Schema
-- Version: 999 (Consolidation Migration)
-- Created: 2025-01-09
-- Purpose: Consolidated migration that safely creates all tables and schema changes
-- ============================================
-- 
-- This migration consolidates all existing migrations into a single, comprehensive schema.
-- It uses IF NOT EXISTS clauses extensively to ensure safety on both new and existing databases.
-- All fixes from migrations 000-029 are included here.
--
-- Migration History Consolidated:
-- - 000: Fix migration issues and core functions
-- - 001: Core schema (users, farms, agents, tasks, sessions, settings)
-- - 002: Monitoring & analytics (metrics, logs, health checks, token usage, alerts)
-- - 003: Harvest & workflow (seeds, harvests, barn items, quick tasks, gowild)
-- - 004: Security & API (api keys, security audits, access tokens, permissions)
-- - 005: Cluster & providers (cluster nodes, load balancing, cross-provider)
-- - 024: Column synchronization and aliases
-- - 025: Session health tracking (consolidated from both 025 versions)
-- - 026: Harvest config fixes and default users
-- - 027: Add harvest tags
-- - 028: Cleanup orphaned farms and recovery tracking
-- - 029: Fix barn sync log missing column

BEGIN;

-- ============================================
-- EXTENSIONS & FUNCTIONS
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- Core function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- MIGRATION TRACKING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    filename VARCHAR(255) NOT NULL,
    checksum VARCHAR(64),
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at DESC);

-- ============================================
-- CORE SCHEMA: USERS & AUTHENTICATION
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
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System user for automated operations
INSERT INTO users (id, email, username, password_hash, roles, permissions, metadata)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'system@maifarm.local',
    'system',
    '$2b$10$SYSTEM.USER.NOT.FOR.LOGIN',
    ARRAY['system'],
    ARRAY['admin', 'read', 'write', 'delete'],
    '{"type": "system", "description": "Default system user for automated processes"}'
) ON CONFLICT (id) DO UPDATE SET 
    roles = EXCLUDED.roles,
    permissions = EXCLUDED.permissions,
    metadata = EXCLUDED.metadata;

-- ============================================
-- CORE SCHEMA: FARMS
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
    session_pid INTEGER,
    
    -- Lifecycle tracking
    last_heartbeat TIMESTAMP,
    last_health_check TIMESTAMP,
    orphaned_at TIMESTAMP,
    recovery_attempted BOOLEAN DEFAULT FALSE,
    recovery_attempts INTEGER DEFAULT 0,
    last_recovery_at TIMESTAMP,
    last_recovery_attempt TIMESTAMP,
    persist_in_background BOOLEAN DEFAULT FALSE,
    crash_count INTEGER DEFAULT 0,
    last_crash_at TIMESTAMP,
    session_started_at TIMESTAMP,
    
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
    last_activity TIMESTAMP,
    
    -- Constraints
    CONSTRAINT farms_status_check CHECK (status IN (
        'idle', 'launching', 'active', 'running', 'paused', 
        'harvesting', 'completed', 'failed', 'terminated',
        'preparing', 'stopped', 'deleted', 'crashed', 'recovering', 'stale'
    ))
);

-- ============================================
-- CORE SCHEMA: AGENTS
-- ============================================

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL,
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

-- Add foreign key constraint after farms table is created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'agents_farm_id_fkey'
    ) THEN
        ALTER TABLE agents ADD CONSTRAINT agents_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- CORE SCHEMA: TASKS
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID,
    agent_id UUID,
    
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

-- Add foreign key constraints after tables are created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tasks_farm_id_fkey'
    ) THEN
        ALTER TABLE tasks ADD CONSTRAINT tasks_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tasks_agent_id_fkey'
    ) THEN
        ALTER TABLE tasks ADD CONSTRAINT tasks_agent_id_fkey 
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- CORE SCHEMA: SESSIONS & SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    token TEXT UNIQUE NOT NULL,
    data JSONB DEFAULT '{}',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'sessions_user_id_fkey'
    ) THEN
        ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

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
-- TMUX SESSIONS & LIFECYCLE TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS tmux_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_name VARCHAR(255) UNIQUE NOT NULL,
    farm_id UUID,
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

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tmux_sessions_farm_id_fkey'
    ) THEN
        ALTER TABLE tmux_sessions ADD CONSTRAINT tmux_sessions_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS farm_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT lifecycle_event_type_check CHECK (event_type IN (
        'created', 'launched', 'activated', 'paused', 'resumed',
        'harvesting', 'completed', 'failed', 'terminated',
        'orphaned', 'recovered', 'heartbeat'
    ))
);

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'farm_lifecycle_events_farm_id_fkey'
    ) THEN
        ALTER TABLE farm_lifecycle_events ADD CONSTRAINT farm_lifecycle_events_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- SESSION HEALTH TRACKING (from migrations 025)
-- ============================================

CREATE TABLE IF NOT EXISTS session_health_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID,
    session_name VARCHAR(255) NOT NULL,
    
    -- Health check details
    check_type VARCHAR(50) NOT NULL, -- 'routine', 'manual', 'startup', 'recovery'
    session_exists BOOLEAN NOT NULL,
    pane_count INTEGER DEFAULT 0,
    expected_pane_count INTEGER DEFAULT 0,
    
    -- Session details
    session_pid INTEGER,
    session_uptime INTEGER, -- seconds
    
    -- Result
    health_status VARCHAR(50) NOT NULL, -- 'healthy', 'degraded', 'dead', 'unknown'
    issues JSONB DEFAULT '[]',
    
    -- Timestamps
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT health_check_type CHECK (check_type IN (
        'routine', 'manual', 'startup', 'recovery', 'shutdown'
    )),
    CONSTRAINT health_status_check CHECK (health_status IN (
        'healthy', 'degraded', 'dead', 'unknown', 'recovering'
    ))
);

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'session_health_log_farm_id_fkey'
    ) THEN
        ALTER TABLE session_health_log ADD CONSTRAINT session_health_log_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS session_crash_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID,
    session_name VARCHAR(255) NOT NULL,
    
    -- Crash details
    crash_type VARCHAR(50) DEFAULT 'unexpected', -- 'unexpected', 'timeout', 'memory', 'manual'
    crash_reason TEXT,
    last_known_status VARCHAR(50),
    
    -- Session state at crash
    runtime_seconds INTEGER,
    agents_affected INTEGER,
    tasks_lost INTEGER,
    
    -- Recovery info
    recovery_attempted BOOLEAN DEFAULT FALSE,
    recovery_successful BOOLEAN DEFAULT FALSE,
    recovery_method VARCHAR(50), -- 'restart', 'resume', 'manual', 'none'
    
    -- Metadata
    error_logs TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    crashed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recovered_at TIMESTAMP,
    
    CONSTRAINT crash_type_check CHECK (crash_type IN (
        'unexpected', 'timeout', 'memory', 'manual', 'unknown'
    ))
);

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'session_crash_log_farm_id_fkey'
    ) THEN
        ALTER TABLE session_crash_log ADD CONSTRAINT session_crash_log_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- MONITORING & ANALYTICS
-- ============================================

CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    value NUMERIC NOT NULL,
    unit VARCHAR(20),
    labels JSONB DEFAULT '{}',
    category VARCHAR(50), -- Added from migration 024
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(20) NOT NULL,
    source VARCHAR(100),
    message TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    correlation_id VARCHAR(255),
    agent_id UUID,
    farm_id UUID,
    user_id UUID,
    metadata JSONB DEFAULT '{}'
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'logs_agent_id_fkey'
    ) THEN
        ALTER TABLE logs ADD CONSTRAINT logs_agent_id_fkey 
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'logs_farm_id_fkey'
    ) THEN
        ALTER TABLE logs ADD CONSTRAINT logs_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'logs_user_id_fkey'
    ) THEN
        ALTER TABLE logs ADD CONSTRAINT logs_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    details JSONB DEFAULT '{}',
    response_time INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT health_status_check CHECK (status IN (
        'healthy', 'degraded', 'unhealthy', 'unknown'
    ))
);

CREATE TABLE IF NOT EXISTS agent_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    farm_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'healthy',
    heartbeat_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    recovery_count INTEGER DEFAULT 0,
    last_error TEXT,
    metrics JSONB DEFAULT '{}',
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT agent_health_status_check CHECK (status IN (
        'healthy', 'degraded', 'unhealthy', 'failed', 'recovering'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'agent_health_checks_agent_id_fkey'
    ) THEN
        ALTER TABLE agent_health_checks ADD CONSTRAINT agent_health_checks_agent_id_fkey 
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'agent_health_checks_farm_id_fkey'
    ) THEN
        ALTER TABLE agent_health_checks ADD CONSTRAINT agent_health_checks_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- TOKEN USAGE TRACKING (with aliases from migration 024)
-- ============================================

CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    farm_id UUID,
    agent_id UUID,
    task_id UUID,
    
    -- Token counts (with aliases)
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,    -- alias for prompt_tokens
    output_tokens INTEGER DEFAULT 0,   -- alias for completion_tokens
    
    -- Cost tracking (with aliases)
    prompt_cost DECIMAL(10, 6) DEFAULT 0,
    completion_cost DECIMAL(10, 6) DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0,
    input_cost DECIMAL(10, 6) DEFAULT 0,     -- alias for prompt_cost
    output_cost DECIMAL(10, 6) DEFAULT 0,    -- alias for completion_cost
    estimated_local_cost DECIMAL(10, 6) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'USD',
    
    -- Additional metadata
    request_type VARCHAR(50),
    response_time INTEGER,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'token_usage_farm_id_fkey'
    ) THEN
        ALTER TABLE token_usage ADD CONSTRAINT token_usage_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'token_usage_agent_id_fkey'
    ) THEN
        ALTER TABLE token_usage ADD CONSTRAINT token_usage_agent_id_fkey 
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'token_usage_task_id_fkey'
    ) THEN
        ALTER TABLE token_usage ADD CONSTRAINT token_usage_task_id_fkey 
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Trigger to keep token usage columns in sync (from migration 024)
CREATE OR REPLACE FUNCTION sync_token_usage_columns() 
RETURNS TRIGGER AS $$
BEGIN
    -- Sync input/output with prompt/completion
    IF NEW.input_tokens IS NOT NULL AND NEW.prompt_tokens IS NULL THEN
        NEW.prompt_tokens := NEW.input_tokens;
    ELSIF NEW.prompt_tokens IS NOT NULL AND NEW.input_tokens IS NULL THEN
        NEW.input_tokens := NEW.prompt_tokens;
    END IF;
    
    IF NEW.output_tokens IS NOT NULL AND NEW.completion_tokens IS NULL THEN
        NEW.completion_tokens := NEW.output_tokens;
    ELSIF NEW.completion_tokens IS NOT NULL AND NEW.output_tokens IS NULL THEN
        NEW.output_tokens := NEW.completion_tokens;
    END IF;
    
    IF NEW.input_cost IS NOT NULL AND NEW.prompt_cost IS NULL THEN
        NEW.prompt_cost := NEW.input_cost;
    ELSIF NEW.prompt_cost IS NOT NULL AND NEW.input_cost IS NULL THEN
        NEW.input_cost := NEW.prompt_cost;
    END IF;
    
    IF NEW.output_cost IS NOT NULL AND NEW.completion_cost IS NULL THEN
        NEW.completion_cost := NEW.output_cost;
    ELSIF NEW.completion_cost IS NOT NULL AND NEW.output_cost IS NULL THEN
        NEW.output_cost := NEW.completion_cost;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_token_usage_columns_trigger ON token_usage;
CREATE TRIGGER sync_token_usage_columns_trigger
    BEFORE INSERT OR UPDATE ON token_usage
    FOR EACH ROW
    EXECUTE FUNCTION sync_token_usage_columns();

-- ============================================
-- ALERTS & NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    condition JSONB NOT NULL,
    severity VARCHAR(20) NOT NULL,
    threshold NUMERIC,
    notification_channels TEXT[] DEFAULT '{}'::TEXT[],
    cooldown_minutes INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT rule_severity_check CHECK (severity IN (
        'info', 'warning', 'error', 'critical'
    ))
);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID,
    severity VARCHAR(20) NOT NULL,
    source VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    details JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID,
    acknowledged_at TIMESTAMP,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT alert_severity_check CHECK (severity IN (
        'info', 'warning', 'error', 'critical'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'alerts_rule_id_fkey'
    ) THEN
        ALTER TABLE alerts ADD CONSTRAINT alerts_rule_id_fkey 
            FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'alerts_acknowledged_by_fkey'
    ) THEN
        ALTER TABLE alerts ADD CONSTRAINT alerts_acknowledged_by_fkey 
            FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- HARVEST & WORKFLOW SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS seeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    
    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    yaml_content TEXT,
    yaml_metadata JSONB DEFAULT '{}',
    additional_prompt TEXT,
    
    -- Source tracking
    source_type VARCHAR(50) DEFAULT 'manual',
    source_seed_id UUID,
    harvest_id UUID, -- Will reference harvests table
    barn_data JSONB DEFAULT '{}',
    
    -- Visibility and usage
    is_public BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    rating DECIMAL(3, 2),
    tags TEXT[] DEFAULT '{}',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_source_type CHECK (source_type IN (
        'manual', 'harvest', 'template', 'imported', 'generated', 'barn'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'seeds_user_id_fkey'
    ) THEN
        ALTER TABLE seeds ADD CONSTRAINT seeds_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'seeds_source_seed_id_fkey'
    ) THEN
        ALTER TABLE seeds ADD CONSTRAINT seeds_source_seed_id_fkey 
            FOREIGN KEY (source_seed_id) REFERENCES seeds(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID,
    created_by UUID DEFAULT '00000000-0000-0000-0000-000000000000',
    
    -- Harvest details
    type VARCHAR(50) DEFAULT 'manual',
    category VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Data
    data JSONB NOT NULL DEFAULT '{}',
    config JSONB DEFAULT '{}', -- Added from migration 026
    summary JSONB DEFAULT '{}',
    results JSONB DEFAULT '[]',
    insights JSONB DEFAULT '[]',
    quality JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}', -- Added from migration 027
    
    -- File tracking
    file_count INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    export_formats TEXT[] DEFAULT ARRAY['json', 'markdown', 'pdf'],
    
    -- Yield tracking
    yield_value INTEGER DEFAULT 0,
    
    -- Template tracking
    farmer_template_id VARCHAR(255),
    farmer_template_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    CONSTRAINT harvests_status_check CHECK (status IN (
        'pending', 'collecting', 'processing', 'completed', 'failed', 'archived'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'harvests_farm_id_fkey'
    ) THEN
        ALTER TABLE harvests ADD CONSTRAINT harvests_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'harvests_created_by_fkey'
    ) THEN
        ALTER TABLE harvests ADD CONSTRAINT harvests_created_by_fkey 
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key to seeds table after harvests is created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'seeds_harvest_id_fkey'
    ) THEN
        ALTER TABLE seeds ADD CONSTRAINT seeds_harvest_id_fkey 
            FOREIGN KEY (harvest_id) REFERENCES harvests(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key to farms table after seeds is created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'farms_seed_id_fkey'
    ) THEN
        ALTER TABLE farms ADD CONSTRAINT farms_seed_id_fkey 
            FOREIGN KEY (seed_id) REFERENCES seeds(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'farms_source_seed_id_fkey'
    ) THEN
        ALTER TABLE farms ADD CONSTRAINT farms_source_seed_id_fkey 
            FOREIGN KEY (source_seed_id) REFERENCES seeds(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS harvest_yield (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID NOT NULL,
    farm_id UUID,
    agent_id UUID,
    
    -- Yield details
    item_type VARCHAR(100) NOT NULL,
    item_name VARCHAR(255),
    item_value JSONB NOT NULL DEFAULT '{}',
    quality_score DECIMAL(3, 2),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'harvest_yield_harvest_id_fkey'
    ) THEN
        ALTER TABLE harvest_yield ADD CONSTRAINT harvest_yield_harvest_id_fkey 
            FOREIGN KEY (harvest_id) REFERENCES harvests(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'harvest_yield_farm_id_fkey'
    ) THEN
        ALTER TABLE harvest_yield ADD CONSTRAINT harvest_yield_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'harvest_yield_agent_id_fkey'
    ) THEN
        ALTER TABLE harvest_yield ADD CONSTRAINT harvest_yield_agent_id_fkey 
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS harvest_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID NOT NULL,
    
    -- Manifest data
    files JSONB DEFAULT '[]',
    total_files INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    
    -- Processing status
    status VARCHAR(50) DEFAULT 'pending',
    processed_files INTEGER DEFAULT 0,
    failed_files INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT manifest_status_check CHECK (status IN (
        'pending', 'processing', 'completed', 'failed'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'harvest_manifests_harvest_id_fkey'
    ) THEN
        ALTER TABLE harvest_manifests ADD CONSTRAINT harvest_manifests_harvest_id_fkey 
            FOREIGN KEY (harvest_id) REFERENCES harvests(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- BARN SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS barn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
    harvest_id UUID,
    
    -- Item details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    type VARCHAR(50) DEFAULT 'file',
    
    -- Data
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    
    -- File tracking
    file_path TEXT,
    file_size BIGINT,
    file_count INTEGER DEFAULT 1,
    mime_type VARCHAR(100),
    
    -- Sync and archive
    sync_status VARCHAR(50) DEFAULT 'pending',
    last_synced_at TIMESTAMP,
    archived_at TIMESTAMP,
    
    -- Template tracking
    farmer_template_id VARCHAR(255),
    farmer_template_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT barn_sync_status_check CHECK (sync_status IN (
        'pending', 'syncing', 'synced', 'failed', 'archived'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'barn_items_user_id_fkey'
    ) THEN
        ALTER TABLE barn_items ADD CONSTRAINT barn_items_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'barn_items_harvest_id_fkey'
    ) THEN
        ALTER TABLE barn_items ADD CONSTRAINT barn_items_harvest_id_fkey 
            FOREIGN KEY (harvest_id) REFERENCES harvests(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS barn_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Sync details
    operation VARCHAR(50) NOT NULL,
    source VARCHAR(100),
    destination VARCHAR(100),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    items_total INTEGER DEFAULT 0,
    items_synced INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    items_deleted INTEGER DEFAULT 0, -- Added from migration 029
    bytes_total BIGINT DEFAULT 0,
    bytes_synced BIGINT DEFAULT 0,
    
    -- Error tracking
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    
    -- Timestamps
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT sync_operation_check CHECK (operation IN (
        'upload', 'download', 'sync', 'archive', 'restore', 'delete'
    )),
    CONSTRAINT sync_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled'
    ))
);

-- ============================================
-- GOWILD SYSTEM (with metrics from migration 024)
-- ============================================

CREATE TABLE IF NOT EXISTS gowild_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID,
    
    -- Session configuration
    config JSONB NOT NULL DEFAULT '{}',
    boundaries JSONB DEFAULT '{}',
    focus_areas TEXT[] DEFAULT '{}',
    
    -- Session state
    status VARCHAR(50) DEFAULT 'initializing',
    phase VARCHAR(50) DEFAULT 'exploration',
    exploration_depth INTEGER DEFAULT 0,
    creativity_level DECIMAL(3, 2) DEFAULT 0.5,
    
    -- Progress tracking
    discoveries_count INTEGER DEFAULT 0,
    checkpoints_count INTEGER DEFAULT 0,
    rollbacks_count INTEGER DEFAULT 0,
    
    -- Results
    summary JSONB DEFAULT '{}',
    insights JSONB DEFAULT '[]',
    metrics JSONB DEFAULT '{}', -- Added from migration 024
    
    -- Timestamps
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paused_at TIMESTAMP,
    resumed_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    CONSTRAINT gowild_status_check CHECK (status IN (
        'initializing', 'running', 'paused', 'completed', 'failed', 'rolled_back'
    )),
    CONSTRAINT gowild_phase_check CHECK (phase IN (
        'exploration', 'exploitation', 'refinement', 'validation', 'completion'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'gowild_sessions_farm_id_fkey'
    ) THEN
        ALTER TABLE gowild_sessions ADD CONSTRAINT gowild_sessions_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS gowild_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    
    -- Discovery details
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    
    -- Impact and value
    impact_score DECIMAL(3, 2),
    novelty_score DECIMAL(3, 2),
    confidence DECIMAL(3, 2),
    
    -- Data
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Validation
    validated BOOLEAN DEFAULT FALSE,
    validation_results JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'gowild_discoveries_session_id_fkey'
    ) THEN
        ALTER TABLE gowild_discoveries ADD CONSTRAINT gowild_discoveries_session_id_fkey 
            FOREIGN KEY (session_id) REFERENCES gowild_sessions(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS gowild_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    
    -- Checkpoint details
    checkpoint_number INTEGER NOT NULL,
    state JSONB NOT NULL,
    
    -- Metrics at checkpoint
    discoveries_count INTEGER DEFAULT 0,
    exploration_depth INTEGER DEFAULT 0,
    quality_score DECIMAL(3, 2),
    
    -- Rollback info
    is_active BOOLEAN DEFAULT TRUE,
    rolled_back_to BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'gowild_checkpoints_session_id_fkey'
    ) THEN
        ALTER TABLE gowild_checkpoints ADD CONSTRAINT gowild_checkpoints_session_id_fkey 
            FOREIGN KEY (session_id) REFERENCES gowild_sessions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- QUICK TASKS
-- ============================================

CREATE TABLE IF NOT EXISTS quick_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    
    -- Task details
    title VARCHAR(255),
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Configuration
    config JSONB DEFAULT '{}',
    timeout_ms INTEGER DEFAULT 300000, -- 5 minutes
    
    -- Results
    result JSONB,
    output TEXT,
    error TEXT,
    
    -- Template tracking
    farmer_template_id VARCHAR(255),
    farmer_template_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    CONSTRAINT quick_task_status_check CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'quick_tasks_user_id_fkey'
    ) THEN
        ALTER TABLE quick_tasks ADD CONSTRAINT quick_tasks_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- TASK CHECKPOINTS
-- ============================================

CREATE TABLE IF NOT EXISTS task_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    
    -- Checkpoint data
    checkpoint_number INTEGER NOT NULL,
    state JSONB NOT NULL,
    progress INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(task_id, checkpoint_number)
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'task_checkpoints_task_id_fkey'
    ) THEN
        ALTER TABLE task_checkpoints ADD CONSTRAINT task_checkpoints_task_id_fkey 
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================
-- WORKSPACE POOL
-- ============================================

CREATE TABLE IF NOT EXISTS workspace_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Workspace details
    workspace_path TEXT UNIQUE NOT NULL,
    farm_id UUID,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'available',
    locked_by UUID,
    locked_at TIMESTAMP,
    
    -- Cleanup tracking
    last_cleaned_at TIMESTAMP,
    size_bytes BIGINT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT workspace_status_check CHECK (status IN (
        'available', 'locked', 'cleaning', 'corrupted'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'workspace_pool_farm_id_fkey'
    ) THEN
        ALTER TABLE workspace_pool ADD CONSTRAINT workspace_pool_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'workspace_pool_locked_by_fkey'
    ) THEN
        ALTER TABLE workspace_pool ADD CONSTRAINT workspace_pool_locked_by_fkey 
            FOREIGN KEY (locked_by) REFERENCES farms(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- SECURITY & API MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    
    -- Key identification
    name VARCHAR(255) NOT NULL,
    service VARCHAR(100) NOT NULL,
    key_encrypted TEXT NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    
    -- Permissions and access
    permissions TEXT[] DEFAULT '{}'::TEXT[],
    rate_limit INTEGER DEFAULT 1000,
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP,
    
    -- Status and lifecycle
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_reason TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT api_key_service_check CHECK (service IN (
        'anthropic', 'openai', 'google', 'azure', 'aws', 'groq', 
        'together', 'replicate', 'huggingface', 'cohere', 'internal'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'api_keys_user_id_fkey'
    ) THEN
        ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS security_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Audit identification
    audit_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Findings
    title VARCHAR(255) NOT NULL,
    description TEXT,
    findings JSONB DEFAULT '[]',
    vulnerabilities JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    
    -- Risk assessment
    risk_score INTEGER,
    impact_level VARCHAR(20),
    
    -- Remediation
    remediation_status VARCHAR(50) DEFAULT 'not_started',
    remediation_notes TEXT,
    remediated_by UUID,
    remediated_at TIMESTAMP,
    
    -- Resource tracking
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    affected_resources JSONB DEFAULT '[]',
    
    -- Compliance
    compliance_standards TEXT[] DEFAULT '{}'::TEXT[],
    compliance_status JSONB DEFAULT '{}',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT audit_severity_check CHECK (severity IN (
        'info', 'low', 'medium', 'high', 'critical'
    )),
    CONSTRAINT audit_status_check CHECK (status IN (
        'pending', 'in_progress', 'completed', 'failed', 'archived'
    )),
    CONSTRAINT remediation_status_check CHECK (remediation_status IN (
        'not_started', 'in_progress', 'completed', 'verified', 'accepted_risk'
    ))
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'security_audits_remediated_by_fkey'
    ) THEN
        ALTER TABLE security_audits ADD CONSTRAINT security_audits_remediated_by_fkey 
            FOREIGN KEY (remediated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'security_audits_created_by_fkey'
    ) THEN
        ALTER TABLE security_audits ADD CONSTRAINT security_audits_created_by_fkey 
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- THINKING STRATEGY SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS thinking_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID,
    farm_id UUID,
    agent_id UUID,
    
    -- Thinking strategy metrics
    thinking_level VARCHAR(50),
    thinking_time_ms INTEGER,
    token_overhead INTEGER,
    complexity_score INTEGER,
    escalation_count INTEGER DEFAULT 0,
    
    -- Performance metrics
    quality_score DECIMAL(3, 2),
    efficiency_score DECIMAL(3, 2),
    
    -- Analysis
    decision_path JSONB DEFAULT '[]',
    reasoning_steps INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'thinking_metrics_task_id_fkey'
    ) THEN
        ALTER TABLE thinking_metrics ADD CONSTRAINT thinking_metrics_task_id_fkey 
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'thinking_metrics_farm_id_fkey'
    ) THEN
        ALTER TABLE thinking_metrics ADD CONSTRAINT thinking_metrics_farm_id_fkey 
            FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'thinking_metrics_agent_id_fkey'
    ) THEN
        ALTER TABLE thinking_metrics ADD CONSTRAINT thinking_metrics_agent_id_fkey 
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS thinking_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    
    -- User preferences
    default_level VARCHAR(50) DEFAULT 'balanced',
    auto_escalate BOOLEAN DEFAULT TRUE,
    max_thinking_time_ms INTEGER DEFAULT 30000,
    
    -- Learned patterns
    task_patterns JSONB DEFAULT '{}',
    success_patterns JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'thinking_preferences_user_id_fkey'
    ) THEN
        ALTER TABLE thinking_preferences ADD CONSTRAINT thinking_preferences_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS thinking_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_hash VARCHAR(64) UNIQUE NOT NULL,
    recommended_level VARCHAR(50),
    confidence DECIMAL(3, 2),
    sample_count INTEGER DEFAULT 1,
    success_rate DECIMAL(3, 2),
    avg_complexity INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PROVIDER METRICS & PERFORMANCE
-- ============================================

CREATE TABLE IF NOT EXISTS provider_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255),
    
    -- Performance metrics
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    avg_response_time INTEGER,
    p95_response_time INTEGER,
    p99_response_time INTEGER,
    
    -- Health metrics
    health_score DECIMAL(3, 2),
    last_error TEXT,
    last_error_at TIMESTAMP,
    
    -- Rate limiting
    rate_limit_hits INTEGER DEFAULT 0,
    quota_remaining INTEGER,
    
    measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'audit_logs_user_id_fkey'
    ) THEN
        ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- COMPREHENSIVE INDEXES
-- ============================================

-- Core table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);

CREATE INDEX IF NOT EXISTS idx_farms_status ON farms(status);
CREATE INDEX IF NOT EXISTS idx_farms_created_by ON farms(created_by);
CREATE INDEX IF NOT EXISTS idx_farms_created_at ON farms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_farms_tmux_session ON farms(tmux_session);
CREATE INDEX IF NOT EXISTS idx_farms_heartbeat ON farms(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_farms_health_check ON farms(last_health_check DESC);
CREATE INDEX IF NOT EXISTS idx_farms_crash_count ON farms(crash_count) WHERE crash_count > 0;
CREATE INDEX IF NOT EXISTS idx_farms_orphaned ON farms(orphaned_at) WHERE orphaned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farms_active ON farms(status) WHERE status IN ('active', 'running', 'launching');
CREATE INDEX IF NOT EXISTS idx_farms_cleanup ON farms(status, created_at, last_activity) 
    WHERE status NOT IN ('completed', 'saved', 'harvested');

CREATE INDEX IF NOT EXISTS idx_agents_farm_id ON agents(farm_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_farm_status ON agents(farm_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat ON agents(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_agents_health_status ON agents(health_status);
CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(status) WHERE status IN ('active', 'working', 'busy');

CREATE INDEX IF NOT EXISTS idx_tasks_farm_id ON tasks(farm_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_farm_status_priority ON tasks(farm_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_pending ON tasks(status) WHERE status IN ('queued', 'assigned');

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- Monitoring & Analytics indexes
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_source_timestamp ON metrics(source, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_source_id_timestamp ON metrics(source_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_type_name ON metrics(type, name);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
CREATE INDEX IF NOT EXISTS idx_logs_correlation_id ON logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_logs_agent_id ON logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_logs_farm_id ON logs(farm_id);
CREATE INDEX IF NOT EXISTS idx_logs_message_fulltext ON logs USING gin(to_tsvector('english', message));

CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
CREATE INDEX IF NOT EXISTS idx_token_usage_farm_id ON token_usage(farm_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent_id ON token_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
CREATE INDEX IF NOT EXISTS idx_token_usage_cost_queries ON token_usage(total_cost DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_input_tokens ON token_usage(input_tokens);
CREATE INDEX IF NOT EXISTS idx_token_usage_output_tokens ON token_usage(output_tokens);

CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);

-- Health tracking indexes
CREATE INDEX IF NOT EXISTS idx_health_log_farm ON session_health_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_health_log_status ON session_health_log(health_status);
CREATE INDEX IF NOT EXISTS idx_health_log_checked ON session_health_log(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_crash_log_farm ON session_crash_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_crash_log_crashed ON session_crash_log(crashed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crash_log_recovery ON session_crash_log(recovery_attempted, recovery_successful);

-- Harvest & Workflow indexes
CREATE INDEX IF NOT EXISTS idx_seeds_user_id ON seeds(user_id);
CREATE INDEX IF NOT EXISTS idx_seeds_harvest_id ON seeds(harvest_id);
CREATE INDEX IF NOT EXISTS idx_seeds_is_public ON seeds(is_public);
CREATE INDEX IF NOT EXISTS idx_seeds_category ON seeds(category);
CREATE INDEX IF NOT EXISTS idx_seeds_usage ON seeds(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_harvests_farm_id ON harvests(farm_id);
CREATE INDEX IF NOT EXISTS idx_harvests_created_by ON harvests(created_by);
CREATE INDEX IF NOT EXISTS idx_harvests_status ON harvests(status);
CREATE INDEX IF NOT EXISTS idx_harvests_type ON harvests(type);
CREATE INDEX IF NOT EXISTS idx_harvests_tags ON harvests USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_harvests_created_at ON harvests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_harvest_yield_harvest_id ON harvest_yield(harvest_id);
CREATE INDEX IF NOT EXISTS idx_harvest_yield_farm_id ON harvest_yield(farm_id);
CREATE INDEX IF NOT EXISTS idx_harvest_yield_agent_id ON harvest_yield(agent_id);

CREATE INDEX IF NOT EXISTS idx_barn_items_user_id ON barn_items(user_id);
CREATE INDEX IF NOT EXISTS idx_barn_items_harvest_id ON barn_items(harvest_id);
CREATE INDEX IF NOT EXISTS idx_barn_items_category ON barn_items(category);
CREATE INDEX IF NOT EXISTS idx_barn_items_archived_at ON barn_items(archived_at) WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_barn_sync_log_sync_id ON barn_sync_log(sync_id);
CREATE INDEX IF NOT EXISTS idx_barn_sync_log_status ON barn_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_barn_sync_log_operation ON barn_sync_log(operation);

-- GoWild indexes
CREATE INDEX IF NOT EXISTS idx_gowild_sessions_farm_id ON gowild_sessions(farm_id);
CREATE INDEX IF NOT EXISTS idx_gowild_sessions_status ON gowild_sessions(status);
CREATE INDEX IF NOT EXISTS idx_gowild_sessions_metrics ON gowild_sessions USING gin(metrics);

CREATE INDEX IF NOT EXISTS idx_gowild_discoveries_session_id ON gowild_discoveries(session_id);
CREATE INDEX IF NOT EXISTS idx_gowild_discoveries_impact ON gowild_discoveries(impact_score DESC);

CREATE INDEX IF NOT EXISTS idx_gowild_checkpoints_session_id ON gowild_checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_gowild_checkpoints_timestamp ON gowild_checkpoints(created_at DESC);

-- Quick tasks indexes
CREATE INDEX IF NOT EXISTS idx_quick_tasks_user_id ON quick_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_quick_tasks_status ON quick_tasks(status);
CREATE INDEX IF NOT EXISTS idx_quick_tasks_created_at ON quick_tasks(created_at DESC);

-- Security indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

CREATE INDEX IF NOT EXISTS idx_security_audits_type ON security_audits(audit_type);
CREATE INDEX IF NOT EXISTS idx_security_audits_severity ON security_audits(severity);
CREATE INDEX IF NOT EXISTS idx_security_audits_status ON security_audits(status);
CREATE INDEX IF NOT EXISTS idx_security_audits_created_at ON security_audits(created_at DESC);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================
-- UPDATE TRIGGERS
-- ============================================

-- Apply update triggers to all tables with updated_at columns
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

CREATE TRIGGER update_seeds_updated_at BEFORE UPDATE ON seeds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_harvests_updated_at BEFORE UPDATE ON harvests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_harvest_manifests_updated_at BEFORE UPDATE ON harvest_manifests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_barn_items_updated_at BEFORE UPDATE ON barn_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspace_pool_updated_at BEFORE UPDATE ON workspace_pool
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_audits_updated_at BEFORE UPDATE ON security_audits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_thinking_preferences_updated_at BEFORE UPDATE ON thinking_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_thinking_recommendations_updated_at BEFORE UPDATE ON thinking_recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get farm health status (from migration 025)
CREATE OR REPLACE FUNCTION get_farm_health_status(p_farm_id UUID)
RETURNS TABLE (
    farm_id UUID,
    session_name VARCHAR,
    status VARCHAR,
    last_health_check TIMESTAMP,
    crash_count INTEGER,
    health_status VARCHAR,
    uptime_hours NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.id as farm_id,
        f.tmux_session as session_name,
        f.status,
        f.last_health_check,
        COALESCE(f.crash_count, 0) as crash_count,
        COALESCE(
            (SELECT h.health_status 
             FROM session_health_log h 
             WHERE h.farm_id = f.id 
             ORDER BY h.checked_at DESC 
             LIMIT 1),
            'unknown'
        ) as health_status,
        CASE 
            WHEN f.session_started_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (NOW() - f.session_started_at)) / 3600
            ELSE 0
        END as uptime_hours
    FROM farms f
    WHERE f.id = p_farm_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DATA MIGRATION & CLEANUP (from recent migrations)
-- ============================================

-- Update existing records with null user_id to use system user (migration 026)
UPDATE barn_items 
SET user_id = '00000000-0000-0000-0000-000000000000'
WHERE user_id IS NULL;

UPDATE harvests 
SET created_by = '00000000-0000-0000-0000-000000000000'
WHERE created_by IS NULL;

-- Initialize metrics for existing gowild sessions (migration 024)
UPDATE gowild_sessions 
SET metrics = jsonb_build_object(
    'nodesExplored', COALESCE(discoveries_count, 0),
    'discoveriesMade', COALESCE(discoveries_count, 0),
    'totalValue', 0,
    'checkpoints', COALESCE(checkpoints_count, 0),
    'rollbacks', COALESCE(rollbacks_count, 0)
)
WHERE metrics = '{}' OR metrics IS NULL;

-- Update existing harvests to have default tags based on their type (migration 027)
UPDATE harvests 
SET tags = ARRAY[type, 'migrated']
WHERE tags IS NULL OR array_length(tags, 1) IS NULL;

-- Set initial health check time for active farms (migration 025)
UPDATE farms 
SET last_health_check = NOW() 
WHERE status IN ('active', 'running', 'launching')
  AND last_health_check IS NULL;

-- Initialize crash count and recovery attempts to 0
UPDATE farms 
SET crash_count = 0, recovery_attempts = 0
WHERE crash_count IS NULL OR recovery_attempts IS NULL;

-- Clean up orphaned farms (migration 028)
UPDATE farms 
SET status = 'failed'
WHERE status IN ('stopped', 'failed', 'error')
  AND created_at < NOW() - INTERVAL '1 hour'
  AND recovery_attempts >= 3;

-- Update barn sync log items_deleted column (migration 029)
UPDATE barn_sync_log 
SET items_deleted = 0 
WHERE items_deleted IS NULL;

-- ============================================
-- RECORD MIGRATION COMPLETION
-- ============================================

-- Record this consolidated migration
INSERT INTO schema_migrations (version, filename, checksum, applied_at, success)
VALUES (
    '999', 
    '999_consolidated_schema.sql',
    md5('consolidated_schema_v999_' || CURRENT_TIMESTAMP::text),
    CURRENT_TIMESTAMP,
    TRUE
) ON CONFLICT (version) DO UPDATE SET
    applied_at = CURRENT_TIMESTAMP,
    success = TRUE,
    checksum = EXCLUDED.checksum;

COMMIT;

-- ============================================
-- POST-MIGRATION VERIFICATION
-- ============================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    trigger_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Count tables
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    
    -- Count indexes
    SELECT COUNT(*) INTO index_count 
    FROM pg_indexes 
    WHERE schemaname = 'public';
    
    -- Count triggers
    SELECT COUNT(*) INTO trigger_count 
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public';
    
    -- Count functions
    SELECT COUNT(*) INTO function_count 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'CONSOLIDATED MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Tables created: %', table_count;
    RAISE NOTICE 'Indexes created: %', index_count;
    RAISE NOTICE 'Triggers created: %', trigger_count;
    RAISE NOTICE 'Functions created: %', function_count;
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Schema is ready for MaiFarm operations!';
    RAISE NOTICE '====================================================';
END $$;

-- End of Consolidated Migration