-- ============================================
-- Migration 005: Cluster & Cross-Provider Support
-- ============================================
-- This migration creates tables for load balancing, clustering, and cross-provider communication
-- Consolidates: 006_load_balancing, 012_cross_provider, remaining enhancements

BEGIN;

-- ============================================
-- CLUSTER NODES
-- ============================================

CREATE TABLE IF NOT EXISTS cluster_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node identification
    node_id VARCHAR(255) UNIQUE NOT NULL,
    hostname VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    port INTEGER DEFAULT 4567,
    
    -- Node configuration
    role VARCHAR(50) NOT NULL DEFAULT 'worker',
    region VARCHAR(50),
    zone VARCHAR(50),
    
    -- Capacity
    max_farms INTEGER DEFAULT 10,
    max_agents INTEGER DEFAULT 50,
    current_farms INTEGER DEFAULT 0,
    current_agents INTEGER DEFAULT 0,
    
    -- Health and status
    status VARCHAR(50) DEFAULT 'initializing',
    health_score DECIMAL(3, 2) DEFAULT 1.0,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Resource usage
    cpu_usage DECIMAL(5, 2),
    memory_usage DECIMAL(5, 2),
    disk_usage DECIMAL(5, 2),
    network_usage DECIMAL(5, 2),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT node_role_check CHECK (role IN (
        'master', 'worker', 'coordinator', 'gateway', 'monitor'
    )),
    CONSTRAINT node_status_check CHECK (status IN (
        'initializing', 'active', 'draining', 'maintenance', 'offline', 'failed'
    ))
);

-- ============================================
-- LOAD BALANCER RULES
-- ============================================

CREATE TABLE IF NOT EXISTS load_balancer_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Rule identification
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 100,
    
    -- Routing configuration
    rule_type VARCHAR(50) NOT NULL,
    conditions JSONB NOT NULL DEFAULT '{}',
    actions JSONB NOT NULL DEFAULT '{}',
    
    -- Target selection
    target_type VARCHAR(50) NOT NULL,
    algorithm VARCHAR(50) DEFAULT 'round_robin',
    sticky_sessions BOOLEAN DEFAULT FALSE,
    session_timeout INTEGER DEFAULT 3600,
    
    -- Health checks
    health_check_enabled BOOLEAN DEFAULT TRUE,
    health_check_interval INTEGER DEFAULT 30,
    health_check_timeout INTEGER DEFAULT 10,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT rule_type_check CHECK (rule_type IN (
        'path', 'header', 'query', 'source_ip', 'provider', 'custom'
    )),
    CONSTRAINT target_type_check CHECK (target_type IN (
        'node', 'provider', 'farm', 'agent'
    )),
    CONSTRAINT algorithm_check CHECK (algorithm IN (
        'round_robin', 'least_connections', 'weighted', 'ip_hash', 
        'consistent_hash', 'random', 'resource_based'
    ))
);

-- ============================================
-- PROVIDER POOL
-- ============================================

CREATE TABLE IF NOT EXISTS provider_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider identification
    provider VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255),
    api_version VARCHAR(20),
    
    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    capabilities TEXT[] DEFAULT '{}'::TEXT[],
    models TEXT[] DEFAULT '{}'::TEXT[],
    
    -- Capacity and limits
    max_concurrent_requests INTEGER DEFAULT 10,
    current_requests INTEGER DEFAULT 0,
    rate_limit INTEGER,
    quota_remaining INTEGER,
    
    -- Performance metrics
    avg_response_time INTEGER,
    success_rate DECIMAL(5, 2),
    error_rate DECIMAL(5, 2),
    
    -- Health and status
    status VARCHAR(50) DEFAULT 'active',
    health_score DECIMAL(3, 2) DEFAULT 1.0,
    last_health_check TIMESTAMP,
    last_error TEXT,
    last_error_at TIMESTAMP,
    
    -- Cost tracking
    cost_per_token DECIMAL(10, 8),
    total_cost DECIMAL(10, 2) DEFAULT 0,
    
    -- Priority and routing
    priority INTEGER DEFAULT 100,
    weight INTEGER DEFAULT 1,
    enabled BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT provider_status_check CHECK (status IN (
        'active', 'degraded', 'throttled', 'offline', 'maintenance'
    ))
);

-- ============================================
-- CROSS PROVIDER MESSAGES
-- ============================================

CREATE TABLE IF NOT EXISTS cross_provider_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Message routing
    source_provider VARCHAR(50) NOT NULL,
    target_provider VARCHAR(50) NOT NULL,
    message_type VARCHAR(100) NOT NULL,
    
    -- Message content
    payload JSONB NOT NULL,
    headers JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Error handling
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    received_at TIMESTAMP,
    processed_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    CONSTRAINT message_status_check CHECK (status IN (
        'pending', 'sending', 'sent', 'received', 'processing', 
        'completed', 'failed', 'expired', 'cancelled'
    ))
);

-- ============================================
-- PROVIDER BRIDGES
-- ============================================

CREATE TABLE IF NOT EXISTS provider_bridges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Bridge configuration
    name VARCHAR(255) NOT NULL,
    source_provider VARCHAR(50) NOT NULL,
    target_provider VARCHAR(50) NOT NULL,
    
    -- Translation rules
    translation_rules JSONB NOT NULL DEFAULT '{}',
    format_converter VARCHAR(100),
    
    -- Routing
    routing_enabled BOOLEAN DEFAULT TRUE,
    routing_rules JSONB DEFAULT '{}',
    
    -- Performance
    throughput_limit INTEGER,
    current_throughput INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    last_sync TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(source_provider, target_provider),
    CONSTRAINT bridge_status_check CHECK (status IN (
        'active', 'paused', 'maintenance', 'failed'
    ))
);

-- ============================================
-- RESOURCE POOLS
-- ============================================

CREATE TABLE IF NOT EXISTS resource_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Pool identification
    pool_name VARCHAR(255) UNIQUE NOT NULL,
    pool_type VARCHAR(50) NOT NULL,
    
    -- Capacity
    total_capacity INTEGER NOT NULL,
    available_capacity INTEGER NOT NULL,
    reserved_capacity INTEGER DEFAULT 0,
    
    -- Resource tracking
    resources JSONB NOT NULL DEFAULT '[]',
    allocations JSONB DEFAULT '{}',
    
    -- Configuration
    allocation_strategy VARCHAR(50) DEFAULT 'best_fit',
    auto_scale BOOLEAN DEFAULT FALSE,
    min_size INTEGER DEFAULT 1,
    max_size INTEGER DEFAULT 100,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    last_allocation TIMESTAMP,
    last_release TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT pool_type_check CHECK (pool_type IN (
        'compute', 'memory', 'storage', 'network', 'api_quota'
    )),
    CONSTRAINT allocation_strategy_check CHECK (allocation_strategy IN (
        'first_fit', 'best_fit', 'worst_fit', 'round_robin', 'priority'
    ))
);

-- ============================================
-- FAILOVER POLICIES
-- ============================================

CREATE TABLE IF NOT EXISTS failover_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Policy identification
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_pattern VARCHAR(255),
    
    -- Trigger conditions
    trigger_conditions JSONB NOT NULL,
    health_threshold DECIMAL(3, 2) DEFAULT 0.5,
    failure_count_threshold INTEGER DEFAULT 3,
    
    -- Failover configuration
    failover_targets JSONB NOT NULL DEFAULT '[]',
    failover_strategy VARCHAR(50) DEFAULT 'sequential',
    max_failover_attempts INTEGER DEFAULT 3,
    
    -- Recovery
    auto_failback BOOLEAN DEFAULT TRUE,
    failback_delay INTEGER DEFAULT 300, -- seconds
    
    -- Status
    enabled BOOLEAN DEFAULT TRUE,
    last_triggered TIMESTAMP,
    trigger_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT failover_strategy_check CHECK (failover_strategy IN (
        'sequential', 'priority', 'random', 'load_based', 'geographic'
    ))
);

-- ============================================
-- CLUSTER EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS cluster_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event identification
    event_type VARCHAR(100) NOT NULL,
    event_source VARCHAR(255) NOT NULL,
    
    -- Event data
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    
    -- Affected resources
    affected_nodes TEXT[] DEFAULT '{}'::TEXT[],
    affected_farms TEXT[] DEFAULT '{}'::TEXT[],
    
    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT event_severity_check CHECK (severity IN (
        'debug', 'info', 'warning', 'error', 'critical'
    ))
);

-- ============================================
-- AGENT METRICS (Extended)
-- ============================================

CREATE TABLE IF NOT EXISTS agent_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    
    -- Performance metrics
    tasks_completed INTEGER DEFAULT 0,
    tasks_failed INTEGER DEFAULT 0,
    avg_task_duration INTEGER,
    
    -- Resource utilization
    cpu_usage_avg DECIMAL(5, 2),
    memory_usage_avg DECIMAL(5, 2),
    
    -- Quality metrics
    success_rate DECIMAL(5, 2),
    error_rate DECIMAL(5, 2),
    quality_score DECIMAL(3, 2),
    
    -- Cost metrics
    total_tokens_used INTEGER DEFAULT 0,
    total_cost DECIMAL(10, 2) DEFAULT 0,
    
    -- Time window
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(agent_id, period_start, period_end)
);

-- ============================================
-- INDEXES
-- ============================================

-- Cluster nodes indexes
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_status ON cluster_nodes(status);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_role ON cluster_nodes(role);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_heartbeat ON cluster_nodes(last_heartbeat DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_nodes_health ON cluster_nodes(health_score DESC);

-- Load balancer rules indexes
CREATE INDEX IF NOT EXISTS idx_lb_rules_enabled ON load_balancer_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_lb_rules_priority ON load_balancer_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_lb_rules_type ON load_balancer_rules(rule_type);

-- Provider pool indexes
CREATE INDEX IF NOT EXISTS idx_provider_pool_provider ON provider_pool(provider);
CREATE INDEX IF NOT EXISTS idx_provider_pool_status ON provider_pool(status);
CREATE INDEX IF NOT EXISTS idx_provider_pool_enabled ON provider_pool(enabled);
CREATE INDEX IF NOT EXISTS idx_provider_pool_priority ON provider_pool(priority DESC);

-- Cross provider messages indexes
CREATE INDEX IF NOT EXISTS idx_cross_provider_msgs_status ON cross_provider_messages(status);
CREATE INDEX IF NOT EXISTS idx_cross_provider_msgs_source ON cross_provider_messages(source_provider);
CREATE INDEX IF NOT EXISTS idx_cross_provider_msgs_target ON cross_provider_messages(target_provider);
CREATE INDEX IF NOT EXISTS idx_cross_provider_msgs_created ON cross_provider_messages(created_at DESC);

-- Provider bridges indexes
CREATE INDEX IF NOT EXISTS idx_provider_bridges_source ON provider_bridges(source_provider);
CREATE INDEX IF NOT EXISTS idx_provider_bridges_target ON provider_bridges(target_provider);
CREATE INDEX IF NOT EXISTS idx_provider_bridges_status ON provider_bridges(status);

-- Resource pools indexes
CREATE INDEX IF NOT EXISTS idx_resource_pools_type ON resource_pools(pool_type);
CREATE INDEX IF NOT EXISTS idx_resource_pools_status ON resource_pools(status);

-- Failover policies indexes
CREATE INDEX IF NOT EXISTS idx_failover_policies_resource ON failover_policies(resource_type);
CREATE INDEX IF NOT EXISTS idx_failover_policies_enabled ON failover_policies(enabled);

-- Cluster events indexes
CREATE INDEX IF NOT EXISTS idx_cluster_events_timestamp ON cluster_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_events_type ON cluster_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cluster_events_severity ON cluster_events(severity);
CREATE INDEX IF NOT EXISTS idx_cluster_events_resolved ON cluster_events(resolved);

-- Agent metrics indexes
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_id ON agent_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_period ON agent_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_created ON agent_metrics(created_at DESC);

COMMIT;