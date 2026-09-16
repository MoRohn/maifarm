-- Migration: 056_thermal_monitoring_system
-- Description: Add tables and indexes for thermal monitoring and auto-throttling system
-- This enables MaiFarm to monitor system thermal state and automatically adjust farming
-- operations to prevent system crashes due to thermal throttling.

-- Create thermal_metrics table for storing thermal readings history
CREATE TABLE IF NOT EXISTS thermal_metrics (
    id VARCHAR(255) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    pressure_level INTEGER NOT NULL DEFAULT 0,
    pressure_label VARCHAR(50) NOT NULL DEFAULT 'nominal',
    cpu_temperature DECIMAL(5,2),
    gpu_temperature DECIMAL(5,2),
    system_temperature DECIMAL(5,2),
    fan_speed_rpm INTEGER,
    fan_speed_percent DECIMAL(5,2),
    is_throttling BOOLEAN DEFAULT FALSE,
    chip_generation VARCHAR(20),
    alert_severity VARCHAR(20),
    alert_message TEXT,
    farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    action_taken VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for time-series queries
CREATE INDEX IF NOT EXISTS idx_thermal_metrics_timestamp
    ON thermal_metrics(timestamp DESC);

-- Create index for alert queries
CREATE INDEX IF NOT EXISTS idx_thermal_metrics_alerts
    ON thermal_metrics(alert_severity, timestamp DESC)
    WHERE alert_severity IS NOT NULL;

-- Create index for throttling events
CREATE INDEX IF NOT EXISTS idx_thermal_metrics_throttling
    ON thermal_metrics(is_throttling, timestamp DESC)
    WHERE is_throttling = TRUE;

-- Create index for farm correlation
CREATE INDEX IF NOT EXISTS idx_thermal_metrics_farm
    ON thermal_metrics(farm_id, timestamp DESC)
    WHERE farm_id IS NOT NULL;

-- Create thermal_alerts table for active alerts and history
CREATE TABLE IF NOT EXISTS thermal_alerts (
    id VARCHAR(255) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    severity VARCHAR(20) NOT NULL,
    pressure_level INTEGER NOT NULL,
    message TEXT NOT NULL,
    action_type VARCHAR(50),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES users(id),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    farm_ids JSONB DEFAULT '[]'::jsonb,
    metrics_snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for active alerts
CREATE INDEX IF NOT EXISTS idx_thermal_alerts_active
    ON thermal_alerts(acknowledged, resolved, timestamp DESC)
    WHERE acknowledged = FALSE AND resolved = FALSE;

-- Create thermal_farm_actions table to track automatic actions taken on farms
CREATE TABLE IF NOT EXISTS thermal_farm_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    trigger_pressure_level INTEGER NOT NULL,
    trigger_temperature DECIMAL(5,2),
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    original_agent_count INTEGER,
    adjusted_agent_count INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resumed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- Create index for farm action history
CREATE INDEX IF NOT EXISTS idx_thermal_farm_actions_farm
    ON thermal_farm_actions(farm_id, timestamp DESC);

-- Create index for action type queries
CREATE INDEX IF NOT EXISTS idx_thermal_farm_actions_type
    ON thermal_farm_actions(action_type, timestamp DESC);

-- Create thermal_thresholds table for user-configurable thresholds
CREATE TABLE IF NOT EXISTS thermal_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    cpu_warning DECIMAL(5,2) DEFAULT 80.0,
    cpu_critical DECIMAL(5,2) DEFAULT 95.0,
    gpu_warning DECIMAL(5,2) DEFAULT 85.0,
    gpu_critical DECIMAL(5,2) DEFAULT 100.0,
    reduce_agents_at INTEGER DEFAULT 1,
    pause_farms_at INTEGER DEFAULT 2,
    emergency_stop_at INTEGER DEFAULT 3,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Add thermal-related columns to farms table if not exists
DO $$
BEGIN
    -- Add thermal_paused column to farms
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'farms' AND column_name = 'thermal_paused') THEN
        ALTER TABLE farms ADD COLUMN thermal_paused BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add thermal_paused_at column to farms
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'farms' AND column_name = 'thermal_paused_at') THEN
        ALTER TABLE farms ADD COLUMN thermal_paused_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add thermal_resume_count column to farms
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'farms' AND column_name = 'thermal_resume_count') THEN
        ALTER TABLE farms ADD COLUMN thermal_resume_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Create function to clean up old thermal metrics (retention: 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_thermal_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM thermal_metrics
    WHERE timestamp < NOW() - INTERVAL '7 days'
    AND alert_severity IS NULL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for thermal analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS thermal_hourly_stats AS
SELECT
    date_trunc('hour', timestamp) as hour,
    AVG(cpu_temperature) as avg_cpu_temp,
    MAX(cpu_temperature) as max_cpu_temp,
    AVG(gpu_temperature) as avg_gpu_temp,
    MAX(gpu_temperature) as max_gpu_temp,
    AVG(pressure_level) as avg_pressure_level,
    MAX(pressure_level) as max_pressure_level,
    COUNT(*) FILTER (WHERE is_throttling = TRUE) as throttle_events,
    COUNT(*) FILTER (WHERE alert_severity IS NOT NULL) as alert_count,
    COUNT(*) as sample_count
FROM thermal_metrics
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY date_trunc('hour', timestamp)
ORDER BY hour DESC;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_thermal_hourly_stats_hour
    ON thermal_hourly_stats(hour);

-- Insert default thresholds into system_config if not exists
INSERT INTO system_config (key, value, updated_at)
VALUES (
    'thermal_thresholds',
    '{"cpuWarning": 80, "cpuCritical": 95, "gpuWarning": 85, "gpuCritical": 100, "reduceAgentsAt": 1, "pauseFarmsAt": 2, "emergencyStopAt": 3}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON thermal_metrics TO maifarm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON thermal_alerts TO maifarm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON thermal_farm_actions TO maifarm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON thermal_thresholds TO maifarm_app;
GRANT SELECT ON thermal_hourly_stats TO maifarm_app;

-- Comment on tables
COMMENT ON TABLE thermal_metrics IS 'Time-series thermal readings for system monitoring';
COMMENT ON TABLE thermal_alerts IS 'Thermal alerts and notifications history';
COMMENT ON TABLE thermal_farm_actions IS 'Actions taken on farms due to thermal events';
COMMENT ON TABLE thermal_thresholds IS 'User-configurable thermal thresholds';
COMMENT ON MATERIALIZED VIEW thermal_hourly_stats IS 'Hourly aggregated thermal statistics';
