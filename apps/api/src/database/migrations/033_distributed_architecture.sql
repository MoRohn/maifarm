-- Migration 033: Distributed Architecture Support
-- Adds tables for distributed system coordination

-- Farm assignments table for tracking which instance handles which farm
CREATE TABLE IF NOT EXISTS farm_assignments (
    farm_id VARCHAR(255) PRIMARY KEY,
    instance_id VARCHAR(255) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    migration_in_progress BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',

    INDEX idx_instance_id (instance_id),
    INDEX idx_assigned_at (assigned_at)
);

-- Service registry for microservices discovery
CREATE TABLE IF NOT EXISTS service_registry (
    id VARCHAR(255) PRIMARY KEY,
    service_name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    health_check_url VARCHAR(500) DEFAULT '/health',
    capabilities TEXT[],
    status VARCHAR(50) DEFAULT 'healthy',
    last_health_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_service_name (service_name),
    INDEX idx_status (status),
    UNIQUE KEY unique_service_instance (service_name, id)
);

-- Distributed events log for audit and debugging
CREATE TABLE IF NOT EXISTS distributed_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    source_instance VARCHAR(255) NOT NULL,
    target_instance VARCHAR(255),
    channel VARCHAR(255) NOT NULL,
    payload JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,

    INDEX idx_event_type (event_type),
    INDEX idx_source (source_instance),
    INDEX idx_created_at (created_at),
    INDEX idx_status (status)
);

-- Circuit breaker states for service resilience
CREATE TABLE IF NOT EXISTS circuit_breaker_states (
    service_name VARCHAR(255) PRIMARY KEY,
    state VARCHAR(20) NOT NULL DEFAULT 'closed', -- closed, open, half-open
    failure_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    last_failure TIMESTAMP,
    next_attempt TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_state (state)
);

-- Instance metrics for scaling decisions
CREATE TABLE IF NOT EXISTS instance_metrics (
    instance_id VARCHAR(255) NOT NULL,
    metric_time TIMESTAMP NOT NULL,
    farms_count INTEGER DEFAULT 0,
    agents_count INTEGER DEFAULT 0,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    network_in_bytes BIGINT,
    network_out_bytes BIGINT,
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    average_response_time DECIMAL(10,2),
    metadata JSONB DEFAULT '{}',

    PRIMARY KEY (instance_id, metric_time),
    INDEX idx_metric_time (metric_time)
);

-- Scaling events history
CREATE TABLE IF NOT EXISTS scaling_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- scale_up, scale_down, rebalance
    reason TEXT,
    target_instances INTEGER,
    current_instances INTEGER,
    initiated_by VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);

-- Distributed locks for coordination
CREATE TABLE IF NOT EXISTS distributed_locks (
    lock_name VARCHAR(255) PRIMARY KEY,
    owner_instance VARCHAR(255) NOT NULL,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    metadata JSONB DEFAULT '{}',

    INDEX idx_owner (owner_instance),
    INDEX idx_expires_at (expires_at)
);

-- Message queue for reliable inter-service communication
CREATE TABLE IF NOT EXISTS message_queue (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    source_service VARCHAR(255) NOT NULL,
    target_service VARCHAR(255) NOT NULL,
    message_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    priority INTEGER DEFAULT 5,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, dead_letter
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    next_retry_at TIMESTAMP,

    INDEX idx_status_priority (status, priority DESC),
    INDEX idx_target_service (target_service),
    INDEX idx_created_at (created_at),
    INDEX idx_next_retry (next_retry_at)
);

-- Add distributed system columns to existing farms table if not present
ALTER TABLE farms ADD COLUMN IF NOT EXISTS assigned_instance VARCHAR(255);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS last_instance_heartbeat TIMESTAMP;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS distribution_metadata JSONB DEFAULT '{}';

-- Add indexes for distributed queries
CREATE INDEX IF NOT EXISTS idx_farms_assigned_instance ON farms(assigned_instance);
CREATE INDEX IF NOT EXISTS idx_farms_instance_heartbeat ON farms(last_instance_heartbeat);

-- Create function to clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks() RETURNS void AS $$
BEGIN
    DELETE FROM distributed_locks WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Create function to update service registry heartbeat
CREATE OR REPLACE FUNCTION update_service_heartbeat(
    p_service_id VARCHAR(255),
    p_status VARCHAR(50)
) RETURNS void AS $$
BEGIN
    UPDATE service_registry
    SET
        status = p_status,
        last_health_check = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_service_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to record scaling event
CREATE OR REPLACE FUNCTION record_scaling_event(
    p_event_type VARCHAR(50),
    p_reason TEXT,
    p_target_instances INTEGER,
    p_current_instances INTEGER,
    p_initiated_by VARCHAR(255)
) RETURNS INTEGER AS $$
DECLARE
    v_event_id INTEGER;
BEGIN
    INSERT INTO scaling_events (
        event_type, reason, target_instances,
        current_instances, initiated_by
    ) VALUES (
        p_event_type, p_reason, p_target_instances,
        p_current_instances, p_initiated_by
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON TABLE farm_assignments IS 'Tracks which instance is responsible for each farm in distributed setup';
COMMENT ON TABLE service_registry IS 'Service discovery registry for microservices architecture';
COMMENT ON TABLE distributed_events IS 'Event log for distributed system coordination and debugging';
COMMENT ON TABLE circuit_breaker_states IS 'Circuit breaker patterns for service resilience';
COMMENT ON TABLE instance_metrics IS 'Performance metrics per instance for scaling decisions';
COMMENT ON TABLE scaling_events IS 'History of auto-scaling events';
COMMENT ON TABLE distributed_locks IS 'Distributed locking mechanism for coordination';
COMMENT ON TABLE message_queue IS 'Reliable message queue for inter-service communication';