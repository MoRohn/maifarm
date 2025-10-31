-- Migration 034: Distributed Tracing Support
-- Adds tables for distributed tracing and performance monitoring

-- Distributed traces table
CREATE TABLE IF NOT EXISTS distributed_traces (
    trace_id VARCHAR(255) NOT NULL,
    span_id VARCHAR(255) PRIMARY KEY,
    parent_span_id VARCHAR(255),
    operation_name VARCHAR(255) NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    start_time DECIMAL(20,3) NOT NULL,
    end_time DECIMAL(20,3),
    duration DECIMAL(20,3),
    status VARCHAR(20) DEFAULT 'in_progress', -- in_progress, completed, error
    tags JSONB DEFAULT '{}',
    logs JSONB DEFAULT '[]',
    error JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_trace_id (trace_id),
    INDEX idx_parent_span (parent_span_id),
    INDEX idx_service_name (service_name),
    INDEX idx_operation_name (operation_name),
    INDEX idx_start_time (start_time),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Trace summaries for faster queries
CREATE TABLE IF NOT EXISTS trace_summaries (
    trace_id VARCHAR(255) PRIMARY KEY,
    root_span_id VARCHAR(255) NOT NULL,
    total_duration DECIMAL(20,3),
    span_count INTEGER DEFAULT 1,
    service_count INTEGER DEFAULT 1,
    error_count INTEGER DEFAULT 0,
    min_start_time DECIMAL(20,3),
    max_end_time DECIMAL(20,3),
    services TEXT[],
    critical_path_duration DECIMAL(20,3),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_created_at (created_at),
    INDEX idx_error_count (error_count),
    INDEX idx_total_duration (total_duration)
);

-- Service dependencies discovered through tracing
CREATE TABLE IF NOT EXISTS service_dependencies (
    source_service VARCHAR(255) NOT NULL,
    target_service VARCHAR(255) NOT NULL,
    call_count INTEGER DEFAULT 1,
    error_count INTEGER DEFAULT 0,
    total_duration DECIMAL(20,3) DEFAULT 0,
    average_duration DECIMAL(20,3) DEFAULT 0,
    p50_duration DECIMAL(20,3),
    p95_duration DECIMAL(20,3),
    p99_duration DECIMAL(20,3),
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (source_service, target_service),
    INDEX idx_source (source_service),
    INDEX idx_target (target_service),
    INDEX idx_last_seen (last_seen)
);

-- Performance baselines for anomaly detection
CREATE TABLE IF NOT EXISTS performance_baselines (
    service_name VARCHAR(255) NOT NULL,
    operation_name VARCHAR(255) NOT NULL,
    baseline_duration_p50 DECIMAL(20,3),
    baseline_duration_p95 DECIMAL(20,3),
    baseline_duration_p99 DECIMAL(20,3),
    baseline_error_rate DECIMAL(5,4),
    sample_count INTEGER DEFAULT 0,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (service_name, operation_name),
    INDEX idx_service (service_name),
    INDEX idx_operation (operation_name)
);

-- Trace anomalies for alerting
CREATE TABLE IF NOT EXISTS trace_anomalies (
    id SERIAL PRIMARY KEY,
    trace_id VARCHAR(255) NOT NULL,
    span_id VARCHAR(255) NOT NULL,
    anomaly_type VARCHAR(50) NOT NULL, -- slow_span, high_error_rate, unusual_pattern
    severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
    description TEXT,
    expected_value DECIMAL(20,3),
    actual_value DECIMAL(20,3),
    deviation_percentage DECIMAL(10,2),
    service_name VARCHAR(255),
    operation_name VARCHAR(255),
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',

    INDEX idx_trace_id (trace_id),
    INDEX idx_anomaly_type (anomaly_type),
    INDEX idx_severity (severity),
    INDEX idx_detected_at (detected_at),
    INDEX idx_service_operation (service_name, operation_name)
);

-- Sampling decisions for adaptive sampling
CREATE TABLE IF NOT EXISTS sampling_decisions (
    service_name VARCHAR(255) NOT NULL,
    operation_name VARCHAR(255) NOT NULL,
    sampling_rate DECIMAL(5,4) DEFAULT 1.0,
    reason VARCHAR(100), -- manual, adaptive, error_based
    adjusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    PRIMARY KEY (service_name, operation_name),
    INDEX idx_expires_at (expires_at)
);

-- Function to update trace summary
CREATE OR REPLACE FUNCTION update_trace_summary(p_trace_id VARCHAR(255))
RETURNS void AS $$
DECLARE
    v_root_span_id VARCHAR(255);
    v_min_start DECIMAL(20,3);
    v_max_end DECIMAL(20,3);
    v_span_count INTEGER;
    v_error_count INTEGER;
    v_services TEXT[];
BEGIN
    -- Get aggregated data
    SELECT
        MIN(start_time),
        MAX(end_time),
        COUNT(*),
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END),
        ARRAY_AGG(DISTINCT service_name)
    INTO
        v_min_start,
        v_max_end,
        v_span_count,
        v_error_count,
        v_services
    FROM distributed_traces
    WHERE trace_id = p_trace_id;

    -- Find root span
    SELECT span_id INTO v_root_span_id
    FROM distributed_traces
    WHERE trace_id = p_trace_id AND parent_span_id IS NULL
    LIMIT 1;

    -- Insert or update summary
    INSERT INTO trace_summaries (
        trace_id, root_span_id, total_duration,
        span_count, service_count, error_count,
        min_start_time, max_end_time, services
    ) VALUES (
        p_trace_id, v_root_span_id, v_max_end - v_min_start,
        v_span_count, array_length(v_services, 1), v_error_count,
        v_min_start, v_max_end, v_services
    )
    ON CONFLICT (trace_id) DO UPDATE SET
        total_duration = EXCLUDED.total_duration,
        span_count = EXCLUDED.span_count,
        service_count = EXCLUDED.service_count,
        error_count = EXCLUDED.error_count,
        max_end_time = EXCLUDED.max_end_time,
        services = EXCLUDED.services,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to update service dependencies
CREATE OR REPLACE FUNCTION update_service_dependency(
    p_source VARCHAR(255),
    p_target VARCHAR(255),
    p_duration DECIMAL(20,3),
    p_is_error BOOLEAN
) RETURNS void AS $$
BEGIN
    INSERT INTO service_dependencies (
        source_service, target_service,
        call_count, error_count, total_duration,
        average_duration, last_seen
    ) VALUES (
        p_source, p_target,
        1, CASE WHEN p_is_error THEN 1 ELSE 0 END,
        p_duration, p_duration, CURRENT_TIMESTAMP
    )
    ON CONFLICT (source_service, target_service) DO UPDATE SET
        call_count = service_dependencies.call_count + 1,
        error_count = service_dependencies.error_count +
            CASE WHEN p_is_error THEN 1 ELSE 0 END,
        total_duration = service_dependencies.total_duration + p_duration,
        average_duration = (service_dependencies.total_duration + p_duration) /
            (service_dependencies.call_count + 1),
        last_seen = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to detect anomalies
CREATE OR REPLACE FUNCTION detect_trace_anomaly(
    p_span_id VARCHAR(255),
    p_trace_id VARCHAR(255),
    p_service VARCHAR(255),
    p_operation VARCHAR(255),
    p_duration DECIMAL(20,3)
) RETURNS void AS $$
DECLARE
    v_baseline_p95 DECIMAL(20,3);
    v_deviation DECIMAL(10,2);
BEGIN
    -- Get baseline
    SELECT baseline_duration_p95 INTO v_baseline_p95
    FROM performance_baselines
    WHERE service_name = p_service AND operation_name = p_operation;

    -- Check if duration exceeds baseline significantly
    IF v_baseline_p95 IS NOT NULL AND p_duration > v_baseline_p95 * 2 THEN
        v_deviation := ((p_duration - v_baseline_p95) / v_baseline_p95) * 100;

        INSERT INTO trace_anomalies (
            trace_id, span_id, anomaly_type, severity,
            description, expected_value, actual_value,
            deviation_percentage, service_name, operation_name
        ) VALUES (
            p_trace_id, p_span_id, 'slow_span',
            CASE
                WHEN v_deviation > 500 THEN 'critical'
                WHEN v_deviation > 300 THEN 'high'
                WHEN v_deviation > 200 THEN 'medium'
                ELSE 'low'
            END,
            'Span duration significantly exceeds baseline',
            v_baseline_p95, p_duration, v_deviation,
            p_service, p_operation
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update summaries when spans are inserted
CREATE OR REPLACE FUNCTION on_span_insert() RETURNS TRIGGER AS $$
BEGIN
    -- Update trace summary if span is completed
    IF NEW.status = 'completed' OR NEW.status = 'error' THEN
        PERFORM update_trace_summary(NEW.trace_id);

        -- Detect anomalies
        IF NEW.duration IS NOT NULL THEN
            PERFORM detect_trace_anomaly(
                NEW.span_id, NEW.trace_id,
                NEW.service_name, NEW.operation_name,
                NEW.duration
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER span_insert_trigger
AFTER INSERT ON distributed_traces
FOR EACH ROW
EXECUTE FUNCTION on_span_insert();

-- Add comments for documentation
COMMENT ON TABLE distributed_traces IS 'Distributed trace spans for monitoring service interactions';
COMMENT ON TABLE trace_summaries IS 'Aggregated trace metrics for faster queries';
COMMENT ON TABLE service_dependencies IS 'Service dependency graph derived from traces';
COMMENT ON TABLE performance_baselines IS 'Performance baselines for anomaly detection';
COMMENT ON TABLE trace_anomalies IS 'Detected performance anomalies and issues';
COMMENT ON TABLE sampling_decisions IS 'Adaptive sampling rates per operation';