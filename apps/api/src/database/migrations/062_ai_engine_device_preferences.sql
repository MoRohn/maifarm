-- Migration 062: AI Engine Device Preferences
-- Adds device-specific engine preferences and enhanced usage tracking for iOS optimization
-- Created: 2026-01-02

-- ============================================================================
-- Device Engine Preferences Table
-- Stores per-device AI engine configuration for iOS/iPad/Mac optimization
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_engine_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Device identification
    device_id VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL CHECK (device_type IN ('iphone', 'ipad', 'mac', 'web', 'android')),
    device_tier VARCHAR(50) NOT NULL CHECK (device_tier IN ('limited', 'standard', 'performance', 'workstation')),
    device_model VARCHAR(100),
    os_version VARCHAR(50),

    -- Engine preferences
    preferred_engine VARCHAR(50) NOT NULL DEFAULT 'claude'
        CHECK (preferred_engine IN ('claude', 'openai', 'grok', 'ollama', 'localcore', 'gpt-oss', 'llama')),
    preferred_model VARCHAR(100),
    fallback_engine VARCHAR(50)
        CHECK (fallback_engine IS NULL OR fallback_engine IN ('claude', 'openai', 'grok', 'ollama', 'localcore', 'gpt-oss', 'llama')),
    fallback_model VARCHAR(100),

    -- Device-aware configuration
    auto_switch_on_thermal BOOLEAN DEFAULT true,
    auto_switch_on_battery BOOLEAN DEFAULT true,
    auto_switch_on_network BOOLEAN DEFAULT true,
    offline_engine VARCHAR(50) DEFAULT 'gpt-oss'
        CHECK (offline_engine IS NULL OR offline_engine IN ('ollama', 'localcore', 'gpt-oss')),

    -- Throttling preferences
    max_concurrent_requests INTEGER DEFAULT 3,
    request_timeout_ms INTEGER DEFAULT 30000,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE,

    UNIQUE(user_id, device_id)
);

-- Index for fast lookups by user and device
CREATE INDEX IF NOT EXISTS idx_device_preferences_user_device
ON device_engine_preferences(user_id, device_id);

-- Index for finding devices by type/tier
CREATE INDEX IF NOT EXISTS idx_device_preferences_type_tier
ON device_engine_preferences(device_type, device_tier);

-- ============================================================================
-- Engine Usage by Device (Analytics)
-- Tracks AI engine usage metrics per device for optimization insights
-- ============================================================================

CREATE TABLE IF NOT EXISTS engine_usage_by_device (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Device identification
    device_id VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    device_tier VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Engine/model used
    engine VARCHAR(50) NOT NULL,
    model VARCHAR(100),

    -- Usage metrics
    requests_count INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    tokens_used BIGINT DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0,
    average_latency_ms INTEGER,
    p95_latency_ms INTEGER,

    -- Thermal/battery impact
    thermal_throttle_count INTEGER DEFAULT 0,
    low_battery_count INTEGER DEFAULT 0,
    offline_fallback_count INTEGER DEFAULT 0,

    -- Time period (aggregated by day)
    period_date DATE NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(device_id, engine, model, period_date)
);

-- Index for querying by device and date
CREATE INDEX IF NOT EXISTS idx_engine_usage_device_date
ON engine_usage_by_device(device_id, period_date DESC);

-- Index for querying by engine
CREATE INDEX IF NOT EXISTS idx_engine_usage_engine
ON engine_usage_by_device(engine, period_date DESC);

-- Index for aggregation queries
CREATE INDEX IF NOT EXISTS idx_engine_usage_tier_date
ON engine_usage_by_device(device_tier, period_date DESC);

-- ============================================================================
-- Engine Validation Cache
-- Caches API key validation results to reduce redundant validation calls
-- ============================================================================

CREATE TABLE IF NOT EXISTS engine_validation_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Key identification (hashed for security)
    key_hash VARCHAR(64) NOT NULL,
    engine VARCHAR(50) NOT NULL,

    -- Validation result
    is_valid BOOLEAN NOT NULL,
    validation_message TEXT,
    permissions JSONB DEFAULT '[]'::jsonb,

    -- Cache metadata
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    validation_source VARCHAR(50) DEFAULT 'api', -- 'api', 'format_only', 'cached'

    UNIQUE(key_hash, engine)
);

-- Index for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_validation_cache_lookup
ON engine_validation_cache(key_hash, engine) WHERE expires_at > CURRENT_TIMESTAMP;

-- ============================================================================
-- Engine Configuration History
-- Tracks changes to engine configuration for audit and rollback
-- ============================================================================

CREATE TABLE IF NOT EXISTS engine_config_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    device_id VARCHAR(255),

    -- Change details
    action VARCHAR(50) NOT NULL CHECK (action IN ('configure', 'change_model', 'change_engine', 'reset', 'upgrade')),
    engine VARCHAR(50) NOT NULL,
    old_model VARCHAR(100),
    new_model VARCHAR(100),
    old_config JSONB,
    new_config JSONB,

    -- Context
    trigger_source VARCHAR(50) DEFAULT 'user', -- 'user', 'thermal', 'battery', 'network', 'system'

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying user history
CREATE INDEX IF NOT EXISTS idx_engine_config_history_user
ON engine_config_history(user_id, created_at DESC);

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_device_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_device_preferences_timestamp ON device_engine_preferences;
CREATE TRIGGER update_device_preferences_timestamp
    BEFORE UPDATE ON device_engine_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_device_preferences_timestamp();

-- Function to clean expired validation cache
CREATE OR REPLACE FUNCTION cleanup_expired_validation_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM engine_validation_cache WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to upsert engine usage
CREATE OR REPLACE FUNCTION upsert_engine_usage(
    p_device_id VARCHAR(255),
    p_device_type VARCHAR(50),
    p_device_tier VARCHAR(50),
    p_user_id UUID,
    p_engine VARCHAR(50),
    p_model VARCHAR(100),
    p_tokens_used BIGINT,
    p_cost DECIMAL(10, 6),
    p_latency_ms INTEGER,
    p_success BOOLEAN,
    p_thermal_throttled BOOLEAN DEFAULT FALSE,
    p_low_battery BOOLEAN DEFAULT FALSE,
    p_offline_fallback BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO engine_usage_by_device (
        device_id, device_type, device_tier, user_id,
        engine, model, period_date,
        requests_count, successful_requests, failed_requests,
        tokens_used, total_cost, average_latency_ms,
        thermal_throttle_count, low_battery_count, offline_fallback_count
    ) VALUES (
        p_device_id, p_device_type, p_device_tier, p_user_id,
        p_engine, p_model, CURRENT_DATE,
        1,
        CASE WHEN p_success THEN 1 ELSE 0 END,
        CASE WHEN NOT p_success THEN 1 ELSE 0 END,
        COALESCE(p_tokens_used, 0),
        COALESCE(p_cost, 0),
        p_latency_ms,
        CASE WHEN p_thermal_throttled THEN 1 ELSE 0 END,
        CASE WHEN p_low_battery THEN 1 ELSE 0 END,
        CASE WHEN p_offline_fallback THEN 1 ELSE 0 END
    )
    ON CONFLICT (device_id, engine, model, period_date)
    DO UPDATE SET
        requests_count = engine_usage_by_device.requests_count + 1,
        successful_requests = engine_usage_by_device.successful_requests +
            CASE WHEN p_success THEN 1 ELSE 0 END,
        failed_requests = engine_usage_by_device.failed_requests +
            CASE WHEN NOT p_success THEN 1 ELSE 0 END,
        tokens_used = engine_usage_by_device.tokens_used + COALESCE(p_tokens_used, 0),
        total_cost = engine_usage_by_device.total_cost + COALESCE(p_cost, 0),
        average_latency_ms = (
            (engine_usage_by_device.average_latency_ms * engine_usage_by_device.requests_count) +
            COALESCE(p_latency_ms, 0)
        ) / (engine_usage_by_device.requests_count + 1),
        thermal_throttle_count = engine_usage_by_device.thermal_throttle_count +
            CASE WHEN p_thermal_throttled THEN 1 ELSE 0 END,
        low_battery_count = engine_usage_by_device.low_battery_count +
            CASE WHEN p_low_battery THEN 1 ELSE 0 END,
        offline_fallback_count = engine_usage_by_device.offline_fallback_count +
            CASE WHEN p_offline_fallback THEN 1 ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Materialized View for Device Analytics Dashboard
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_device_engine_analytics AS
SELECT
    device_type,
    device_tier,
    engine,
    model,
    DATE_TRUNC('day', period_date) as date,
    SUM(requests_count) as total_requests,
    SUM(successful_requests) as successful_requests,
    SUM(failed_requests) as failed_requests,
    SUM(tokens_used) as total_tokens,
    SUM(total_cost) as total_cost,
    AVG(average_latency_ms)::INTEGER as avg_latency_ms,
    SUM(thermal_throttle_count) as thermal_throttles,
    SUM(low_battery_count) as low_battery_events,
    SUM(offline_fallback_count) as offline_fallbacks
FROM engine_usage_by_device
WHERE period_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY device_type, device_tier, engine, model, DATE_TRUNC('day', period_date);

-- Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_device_engine_analytics
ON mv_device_engine_analytics(device_type, device_tier, engine, model, date);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE device_engine_preferences IS 'Stores per-device AI engine preferences for iOS/iPad/Mac optimization';
COMMENT ON TABLE engine_usage_by_device IS 'Tracks AI engine usage metrics aggregated by device and day';
COMMENT ON TABLE engine_validation_cache IS 'Caches API key validation results to reduce redundant API calls';
COMMENT ON TABLE engine_config_history IS 'Audit log of engine configuration changes';
COMMENT ON FUNCTION upsert_engine_usage IS 'Upserts engine usage metrics with proper aggregation';
COMMENT ON MATERIALIZED VIEW mv_device_engine_analytics IS 'Pre-aggregated analytics for device engine usage dashboard';
