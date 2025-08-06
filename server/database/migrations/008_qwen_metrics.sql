-- Migration: Add Qwen-specific metrics and provider tracking
-- Date: 2025-08-05
-- Description: Extends the existing metrics system to support Qwen3-Coder provider

-- Add provider column to farms table if not exists
ALTER TABLE farms 
ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'claude';

-- Add provider-specific settings
ALTER TABLE farms
ADD COLUMN IF NOT EXISTS provider_settings JSONB DEFAULT '{}';

-- Create Qwen-specific metrics table
CREATE TABLE IF NOT EXISTS qwen_metrics (
    id SERIAL PRIMARY KEY,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    agent_id VARCHAR(255),
    metric_type VARCHAR(100) NOT NULL,
    metric_value NUMERIC,
    metric_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Qwen-specific fields
    model_name VARCHAR(100),
    is_local BOOLEAN DEFAULT false,
    context_tokens_used INTEGER,
    max_context_tokens INTEGER,
    chain_of_thought_used BOOLEAN DEFAULT false,
    temperature NUMERIC(3, 2),
    
    -- Performance metrics
    response_time_ms INTEGER,
    tokens_per_second NUMERIC,
    
    -- Index for efficient queries
    INDEX idx_qwen_metrics_farm_id (farm_id),
    INDEX idx_qwen_metrics_created_at (created_at),
    INDEX idx_qwen_metrics_type (metric_type)
);

-- Update token_usage table to include provider
ALTER TABLE token_usage
ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'claude';

-- Add Qwen-specific cost calculations
ALTER TABLE token_usage
ADD COLUMN IF NOT EXISTS is_local_model BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS local_compute_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS estimated_local_cost DECIMAL(10, 6) DEFAULT 0;

-- Create provider comparison view
CREATE OR REPLACE VIEW provider_metrics_comparison AS
SELECT 
    f.id as farm_id,
    f.name as farm_name,
    f.provider,
    COUNT(DISTINCT a.id) as agent_count,
    AVG(CASE 
        WHEN f.provider = 'qwen' THEN qm.response_time_ms 
        ELSE NULL 
    END) as avg_qwen_response_ms,
    AVG(CASE 
        WHEN f.provider = 'qwen' THEN qm.context_tokens_used 
        ELSE NULL 
    END) as avg_qwen_context_tokens,
    SUM(tu.prompt_tokens + tu.completion_tokens) as total_tokens,
    SUM(CASE 
        WHEN tu.provider = 'claude' THEN tu.cost 
        ELSE 0 
    END) as claude_cost,
    SUM(CASE 
        WHEN tu.provider = 'qwen' AND NOT tu.is_local_model THEN tu.cost 
        ELSE 0 
    END) as qwen_api_cost,
    SUM(CASE 
        WHEN tu.provider = 'qwen' AND tu.is_local_model THEN tu.estimated_local_cost 
        ELSE 0 
    END) as qwen_local_cost,
    f.created_at,
    f.completed_at
FROM farms f
LEFT JOIN agents a ON f.id = a.farm_id
LEFT JOIN qwen_metrics qm ON f.id = qm.farm_id
LEFT JOIN token_usage tu ON f.id = tu.farm_id
GROUP BY f.id, f.name, f.provider, f.created_at, f.completed_at;

-- Create function to calculate Qwen local model costs
CREATE OR REPLACE FUNCTION calculate_qwen_local_cost(
    compute_time_ms INTEGER,
    model_size VARCHAR(10)
) RETURNS DECIMAL(10, 6) AS $$
DECLARE
    base_cost_per_hour DECIMAL(10, 6);
    cost DECIMAL(10, 6);
BEGIN
    -- Estimate based on model size and local compute
    CASE model_size
        WHEN '7b' THEN base_cost_per_hour := 0.10;  -- $0.10/hour for 7B model
        WHEN '32b' THEN base_cost_per_hour := 0.25; -- $0.25/hour for 32B model
        WHEN '70b' THEN base_cost_per_hour := 0.50; -- $0.50/hour for 70B model
        ELSE base_cost_per_hour := 0.15; -- Default estimate
    END CASE;
    
    -- Convert ms to hours and calculate cost
    cost := (compute_time_ms::DECIMAL / 3600000) * base_cost_per_hour;
    
    RETURN cost;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update costs for local Qwen models
CREATE OR REPLACE FUNCTION update_qwen_local_cost() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.provider = 'qwen' AND NEW.is_local_model = true THEN
        NEW.estimated_local_cost := calculate_qwen_local_cost(
            NEW.local_compute_time_ms,
            COALESCE((NEW.model_name::json->>'size'), '7b')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_qwen_local_cost
BEFORE INSERT OR UPDATE ON token_usage
FOR EACH ROW
EXECUTE FUNCTION update_qwen_local_cost();

-- Add provider performance summary table
CREATE TABLE IF NOT EXISTS provider_performance (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Aggregate metrics
    total_farms INTEGER DEFAULT 0,
    total_agents INTEGER DEFAULT 0,
    total_tasks_completed INTEGER DEFAULT 0,
    avg_completion_time_seconds NUMERIC,
    success_rate NUMERIC(5, 2),
    
    -- Token usage
    total_tokens_used BIGINT DEFAULT 0,
    avg_tokens_per_task NUMERIC,
    
    -- Cost metrics
    total_cost DECIMAL(10, 4) DEFAULT 0,
    avg_cost_per_task DECIMAL(10, 6),
    
    -- Qwen-specific metrics
    qwen_local_usage_percent NUMERIC(5, 2),
    qwen_avg_context_utilization NUMERIC(5, 2),
    qwen_chain_of_thought_usage_percent NUMERIC(5, 2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint for one entry per provider per day
    UNIQUE(provider, date),
    INDEX idx_provider_performance_date (date),
    INDEX idx_provider_performance_provider (provider)
);

-- Function to update provider performance metrics
CREATE OR REPLACE FUNCTION update_provider_performance() RETURNS VOID AS $$
BEGIN
    INSERT INTO provider_performance (
        provider, date, total_farms, total_agents, total_tasks_completed,
        avg_completion_time_seconds, success_rate, total_tokens_used,
        avg_tokens_per_task, total_cost, avg_cost_per_task,
        qwen_local_usage_percent, qwen_avg_context_utilization,
        qwen_chain_of_thought_usage_percent
    )
    SELECT 
        provider,
        CURRENT_DATE,
        COUNT(DISTINCT f.id),
        COUNT(DISTINCT a.id),
        SUM(CASE WHEN f.status = 'completed' THEN 1 ELSE 0 END),
        AVG(EXTRACT(EPOCH FROM (f.completed_at - f.created_at))),
        (SUM(CASE WHEN f.status = 'completed' THEN 1 ELSE 0 END)::NUMERIC / 
         NULLIF(COUNT(f.id), 0)) * 100,
        SUM(tu.prompt_tokens + tu.completion_tokens),
        AVG(tu.prompt_tokens + tu.completion_tokens),
        SUM(tu.cost + COALESCE(tu.estimated_local_cost, 0)),
        AVG(tu.cost + COALESCE(tu.estimated_local_cost, 0)),
        -- Qwen-specific calculations
        CASE 
            WHEN provider = 'qwen' THEN 
                (SUM(CASE WHEN tu.is_local_model THEN 1 ELSE 0 END)::NUMERIC / 
                 NULLIF(COUNT(tu.id), 0)) * 100
            ELSE NULL 
        END,
        CASE 
            WHEN provider = 'qwen' THEN 
                AVG(qm.context_tokens_used::NUMERIC / NULLIF(qm.max_context_tokens, 0)) * 100
            ELSE NULL 
        END,
        CASE 
            WHEN provider = 'qwen' THEN 
                (SUM(CASE WHEN qm.chain_of_thought_used THEN 1 ELSE 0 END)::NUMERIC / 
                 NULLIF(COUNT(qm.id), 0)) * 100
            ELSE NULL 
        END
    FROM farms f
    LEFT JOIN agents a ON f.id = a.farm_id
    LEFT JOIN token_usage tu ON f.id = tu.farm_id
    LEFT JOIN qwen_metrics qm ON f.id = qm.farm_id
    WHERE f.created_at >= CURRENT_DATE
    GROUP BY provider
    ON CONFLICT (provider, date) 
    DO UPDATE SET
        total_farms = EXCLUDED.total_farms,
        total_agents = EXCLUDED.total_agents,
        total_tasks_completed = EXCLUDED.total_tasks_completed,
        avg_completion_time_seconds = EXCLUDED.avg_completion_time_seconds,
        success_rate = EXCLUDED.success_rate,
        total_tokens_used = EXCLUDED.total_tokens_used,
        avg_tokens_per_task = EXCLUDED.avg_tokens_per_task,
        total_cost = EXCLUDED.total_cost,
        avg_cost_per_task = EXCLUDED.avg_cost_per_task,
        qwen_local_usage_percent = EXCLUDED.qwen_local_usage_percent,
        qwen_avg_context_utilization = EXCLUDED.qwen_avg_context_utilization,
        qwen_chain_of_thought_usage_percent = EXCLUDED.qwen_chain_of_thought_usage_percent,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Create scheduled job to update provider performance (requires pg_cron extension)
-- Note: Uncomment if pg_cron is available
-- SELECT cron.schedule('update-provider-performance', '0 * * * *', 'SELECT update_provider_performance();');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON qwen_metrics TO maifarm_user;
GRANT SELECT ON provider_metrics_comparison TO maifarm_user;
GRANT SELECT, INSERT, UPDATE ON provider_performance TO maifarm_user;
GRANT USAGE ON SEQUENCE qwen_metrics_id_seq TO maifarm_user;
GRANT USAGE ON SEQUENCE provider_performance_id_seq TO maifarm_user;