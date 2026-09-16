-- ============================================
-- Migration 002: Monitoring & Analytics
-- ============================================
-- This migration creates monitoring, logging, metrics, and analytics tables
-- Consolidates: 002_monitoring_schema, 007_token_usage, 013_thinking_strategy, 018_performance

-- Transaction removed to prevent foreign key reference issues

-- ============================================
-- METRICS
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
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(20) NOT NULL,
    source VARCHAR(100),
    message TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    correlation_id VARCHAR(255),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'
);

-- ============================================
-- HEALTH CHECKS
-- ============================================

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

-- ============================================
-- AGENT HEALTH CHECKS
-- ============================================

CREATE TABLE IF NOT EXISTS agent_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
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

-- ============================================
-- TOKEN USAGE TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    
    -- Token counts
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    
    -- Cost tracking
    prompt_cost DECIMAL(10, 6) DEFAULT 0,
    completion_cost DECIMAL(10, 6) DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0,
    
    -- Additional metadata
    request_type VARCHAR(50),
    response_time INTEGER,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ALERTS
-- ============================================

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID, -- Will reference alert_rules
    severity VARCHAR(20) NOT NULL,
    source VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    details JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT alert_severity_check CHECK (severity IN (
        'info', 'warning', 'error', 'critical'
    ))
);

-- ============================================
-- ALERT RULES
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

-- Add foreign key for alerts
-- NOTE: Commented out because alerts table may already exist without rule_id column
-- ALTER TABLE alerts ADD CONSTRAINT alerts_rule_id_fkey
--     FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL;

-- ============================================
-- THINKING METRICS
-- ============================================

CREATE TABLE IF NOT EXISTS thinking_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    
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

-- ============================================
-- THINKING PREFERENCES
-- ============================================

CREATE TABLE IF NOT EXISTS thinking_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
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

-- ============================================
-- THINKING RECOMMENDATIONS
-- ============================================

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
-- PROVIDER METRICS
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
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

-- Metrics indexes (optimized for time-series queries)
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_source_timestamp ON metrics(source, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_source_id_timestamp ON metrics(source_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_type_name ON metrics(type, name);
CREATE INDEX IF NOT EXISTS idx_metrics_hourly_source ON metrics(source, date_trunc('hour', timestamp));

-- Logs indexes (optimized for searching and filtering)
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
CREATE INDEX IF NOT EXISTS idx_logs_correlation_id ON logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_logs_agent_id ON logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_logs_farm_id ON logs(farm_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_message_fulltext ON logs USING gin(to_tsvector('english', message));

-- Health checks indexes
CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON health_checks(status);
CREATE INDEX IF NOT EXISTS idx_health_checks_service ON health_checks(service);

-- Agent health indexes
CREATE INDEX IF NOT EXISTS idx_agent_health_status ON agent_health_checks(status);
CREATE INDEX IF NOT EXISTS idx_agent_health_farm ON agent_health_checks(farm_id);
CREATE INDEX IF NOT EXISTS idx_agent_health_agent ON agent_health_checks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_health_checked ON agent_health_checks(checked_at DESC);

-- Token usage indexes (optimized for cost analysis)
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
CREATE INDEX IF NOT EXISTS idx_token_usage_farm_id ON token_usage(farm_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent_id ON token_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
CREATE INDEX IF NOT EXISTS idx_token_usage_cost_queries ON token_usage(total_cost DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider_timestamp ON token_usage(provider, timestamp DESC);

-- Alerts indexes
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(acknowledged, resolved) 
    WHERE acknowledged = FALSE AND resolved = FALSE;

-- Alert rules indexes
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_alert_rules_severity ON alert_rules(severity);

-- Thinking metrics indexes
CREATE INDEX IF NOT EXISTS idx_thinking_metrics_task_id ON thinking_metrics(task_id);
CREATE INDEX IF NOT EXISTS idx_thinking_metrics_level ON thinking_metrics(thinking_level);
CREATE INDEX IF NOT EXISTS idx_thinking_metrics_created_at ON thinking_metrics(created_at DESC);

-- Thinking recommendations index
CREATE INDEX IF NOT EXISTS idx_thinking_recommendations_hash ON thinking_recommendations(task_hash);

-- Provider metrics indexes
CREATE INDEX IF NOT EXISTS idx_provider_metrics_provider ON provider_metrics(provider);
CREATE INDEX IF NOT EXISTS idx_provider_metrics_measured ON provider_metrics(measured_at DESC);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================
-- PARTITIONING FOR HIGH-VOLUME TABLES
-- ============================================

-- Create partitioned tables for high-volume data (optional, for production)
-- Uncomment if you need partitioning for scale

-- Example: Partition metrics by month
-- CREATE TABLE metrics_partitioned (LIKE metrics INCLUDING ALL) PARTITION BY RANGE (timestamp);
-- CREATE TABLE metrics_2025_01 PARTITION OF metrics_partitioned 
--     FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Example: Partition logs by week
-- CREATE TABLE logs_partitioned (LIKE logs INCLUDING ALL) PARTITION BY RANGE (timestamp);
-- CREATE TABLE logs_2025_w01 PARTITION OF logs_partitioned
--     FOR VALUES FROM ('2025-01-01') TO ('2025-01-08');