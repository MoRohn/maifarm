-- Migration 047: AI Engine Management and Cost Tracking
-- Adds comprehensive cost tracking and engine management tables
-- Created: 2025-01-31

-- ====================================================================================
-- AI API USAGE TRACKING
-- ====================================================================================

-- Table for tracking every AI API call with accurate token counts and costs
CREATE TABLE IF NOT EXISTS ai_api_usage (
  id BIGSERIAL PRIMARY KEY,

  -- Correlation IDs
  farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
  agent_id VARCHAR(255),
  user_id INTEGER,
  request_id VARCHAR(255) UNIQUE,

  -- Provider information
  provider VARCHAR(50) NOT NULL, -- 'claude', 'openai'
  model VARCHAR(255) NOT NULL,
  api_version VARCHAR(50),

  -- Token usage (from API response - most accurate)
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- Cost calculation (in USD)
  input_cost DECIMAL(10, 6) NOT NULL DEFAULT 0.000000,
  output_cost DECIMAL(10, 6) NOT NULL DEFAULT 0.000000,
  total_cost DECIMAL(10, 6) NOT NULL DEFAULT 0.000000,

  -- Pricing used for this calculation
  cost_per_1k_input_tokens DECIMAL(10, 6),
  cost_per_1k_output_tokens DECIMAL(10, 6),

  -- Request metadata
  endpoint VARCHAR(255), -- e.g., '/v1/messages', '/v1/chat/completions'
  status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,

  -- Timestamps
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Additional metadata (JSON)
  metadata JSONB,

  -- Indexes for efficient queries
  CONSTRAINT valid_provider CHECK (provider IN ('claude', 'openai', 'qwen', 'ollama')),
  CONSTRAINT valid_tokens CHECK (input_tokens >= 0 AND output_tokens >= 0),
  CONSTRAINT valid_cost CHECK (total_cost >= 0)
);

-- Indexes for fast cost queries
CREATE INDEX IF NOT EXISTS idx_ai_api_usage_farm_id ON ai_api_usage(farm_id);
CREATE INDEX IF NOT EXISTS idx_ai_api_usage_provider ON ai_api_usage(provider);
CREATE INDEX IF NOT EXISTS idx_ai_api_usage_timestamp ON ai_api_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_api_usage_provider_timestamp ON ai_api_usage(provider, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_api_usage_farm_timestamp ON ai_api_usage(farm_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_api_usage_model ON ai_api_usage(model);

-- Index for request deduplication
CREATE INDEX IF NOT EXISTS idx_ai_api_usage_request_id ON ai_api_usage(request_id);

-- Index for cost aggregation queries
CREATE INDEX IF NOT EXISTS idx_ai_api_usage_cost_aggregation
  ON ai_api_usage(provider, model, farm_id, timestamp);

-- ====================================================================================
-- ENGINE CONFIGURATION BACKUPS
-- ====================================================================================

-- Table for backing up engine configurations before upgrades
CREATE TABLE IF NOT EXISTS engine_config_backups (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  restored_at TIMESTAMP,
  notes TEXT,

  CONSTRAINT valid_backup_provider CHECK (provider IN ('claude', 'openai', 'qwen', 'ollama'))
);

CREATE INDEX IF NOT EXISTS idx_engine_config_backups_provider
  ON engine_config_backups(provider);
CREATE INDEX IF NOT EXISTS idx_engine_config_backups_created_at
  ON engine_config_backups(created_at DESC);

-- ====================================================================================
-- COST BUDGETS AND ALERTS
-- ====================================================================================

-- Table for setting cost budgets and alerts
CREATE TABLE IF NOT EXISTS cost_budgets (
  id SERIAL PRIMARY KEY,

  -- Scope
  scope_type VARCHAR(20) NOT NULL, -- 'farm', 'user', 'project', 'global'
  scope_id VARCHAR(255), -- farm_id, user_id, project_id, or NULL for global

  -- Budget configuration
  provider VARCHAR(50), -- NULL for all providers
  budget_period VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
  budget_amount DECIMAL(10, 2) NOT NULL,

  -- Alert thresholds (percentage of budget)
  warning_threshold INTEGER DEFAULT 80,
  critical_threshold INTEGER DEFAULT 95,

  -- Status
  is_active BOOLEAN DEFAULT true,
  current_spend DECIMAL(10, 2) DEFAULT 0.00,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  last_reset TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_budget_scope CHECK (scope_type IN ('farm', 'user', 'project', 'global')),
  CONSTRAINT valid_budget_period CHECK (budget_period IN ('daily', 'weekly', 'monthly', 'yearly')),
  CONSTRAINT valid_budget_amount CHECK (budget_amount > 0),
  CONSTRAINT valid_thresholds CHECK (warning_threshold < critical_threshold AND critical_threshold <= 100)
);

CREATE INDEX IF NOT EXISTS idx_cost_budgets_scope
  ON cost_budgets(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_cost_budgets_active
  ON cost_budgets(is_active, period_start, period_end);

-- ====================================================================================
-- COST ALERTS LOG
-- ====================================================================================

-- Table for logging cost alerts
CREATE TABLE IF NOT EXISTS cost_alerts (
  id SERIAL PRIMARY KEY,
  budget_id INTEGER REFERENCES cost_budgets(id) ON DELETE CASCADE,

  -- Alert details
  alert_type VARCHAR(20) NOT NULL, -- 'warning', 'critical', 'exceeded'
  threshold_percentage INTEGER NOT NULL,
  current_spend DECIMAL(10, 2) NOT NULL,
  budget_amount DECIMAL(10, 2) NOT NULL,

  -- Notification status
  notified BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMP,
  notification_channels TEXT[], -- ['email', 'slack', 'webhook']

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_alert_type CHECK (alert_type IN ('warning', 'critical', 'exceeded'))
);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_budget_id
  ON cost_alerts(budget_id);
CREATE INDEX IF NOT EXISTS idx_cost_alerts_created_at
  ON cost_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_alerts_notified
  ON cost_alerts(notified, created_at DESC);

-- ====================================================================================
-- MODEL USAGE STATISTICS
-- ====================================================================================

-- Materialized view for fast model usage queries
CREATE MATERIALIZED VIEW IF NOT EXISTS model_usage_summary AS
SELECT
  provider,
  model,
  DATE_TRUNC('day', timestamp) as date,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(response_time_ms) as avg_response_time_ms,
  COUNT(*) FILTER (WHERE status_code >= 400) as error_count
FROM ai_api_usage
GROUP BY provider, model, DATE_TRUNC('day', timestamp);

-- Index for the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_usage_summary_unique
  ON model_usage_summary(provider, model, date);

-- Refresh function for materialized view
CREATE OR REPLACE FUNCTION refresh_model_usage_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY model_usage_summary;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================================
-- SETTINGS TABLE UPDATES
-- ====================================================================================

-- Add settings for engine versions and models if not exist
INSERT INTO settings (key, value, updated_at)
VALUES
  ('claude_api_version', '"2023-06-01"'::jsonb, NOW()),
  ('openai_api_version', '"v1"'::jsonb, NOW()),
  ('claude_model', '"claude-3-5-sonnet-20241022"'::jsonb, NOW()),
  ('openai_model', '"gpt-4-turbo-2024-04-09"'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- ====================================================================================
-- HELPER FUNCTIONS
-- ====================================================================================

-- Function to get current cost for a scope
CREATE OR REPLACE FUNCTION get_current_cost(
  p_scope_type VARCHAR,
  p_scope_id VARCHAR,
  p_provider VARCHAR DEFAULT NULL,
  p_start_date TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMP DEFAULT NOW()
)
RETURNS DECIMAL(10, 6) AS $$
DECLARE
  total_cost DECIMAL(10, 6);
BEGIN
  SELECT COALESCE(SUM(total_cost), 0.0)
  INTO total_cost
  FROM ai_api_usage
  WHERE timestamp BETWEEN p_start_date AND p_end_date
    AND (p_provider IS NULL OR provider = p_provider)
    AND (
      (p_scope_type = 'farm' AND farm_id::TEXT = p_scope_id) OR
      (p_scope_type = 'user' AND user_id::TEXT = p_scope_id) OR
      (p_scope_type = 'global')
    );

  RETURN total_cost;
END;
$$ LANGUAGE plpgsql;

-- Function to check budget thresholds
CREATE OR REPLACE FUNCTION check_budget_thresholds()
RETURNS void AS $$
DECLARE
  budget_record RECORD;
  current_spend DECIMAL(10, 2);
  spend_percentage INTEGER;
BEGIN
  FOR budget_record IN
    SELECT * FROM cost_budgets WHERE is_active = true
  LOOP
    -- Get current spend for this budget
    current_spend := get_current_cost(
      budget_record.scope_type,
      budget_record.scope_id,
      budget_record.provider,
      budget_record.period_start,
      budget_record.period_end
    );

    -- Update budget record
    UPDATE cost_budgets
    SET current_spend = current_spend
    WHERE id = budget_record.id;

    -- Calculate spend percentage
    spend_percentage := (current_spend / budget_record.budget_amount * 100)::INTEGER;

    -- Check thresholds
    IF spend_percentage >= 100 THEN
      INSERT INTO cost_alerts (budget_id, alert_type, threshold_percentage, current_spend, budget_amount)
      VALUES (budget_record.id, 'exceeded', 100, current_spend, budget_record.budget_amount)
      ON CONFLICT DO NOTHING;
    ELSIF spend_percentage >= budget_record.critical_threshold THEN
      INSERT INTO cost_alerts (budget_id, alert_type, threshold_percentage, current_spend, budget_amount)
      VALUES (budget_record.id, 'critical', budget_record.critical_threshold, current_spend, budget_record.budget_amount)
      ON CONFLICT DO NOTHING;
    ELSIF spend_percentage >= budget_record.warning_threshold THEN
      INSERT INTO cost_alerts (budget_id, alert_type, threshold_percentage, current_spend, budget_amount)
      VALUES (budget_record.id, 'warning', budget_record.warning_threshold, current_spend, budget_record.budget_amount)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================================
-- TRIGGERS
-- ====================================================================================

-- Trigger to check budget thresholds after each API usage insert
CREATE OR REPLACE FUNCTION trigger_check_budgets()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check budgets periodically to avoid excessive computation
  IF random() < 0.1 THEN -- 10% chance to check on each insert
    PERFORM check_budget_thresholds();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_budgets_on_api_usage ON ai_api_usage;
CREATE TRIGGER check_budgets_on_api_usage
  AFTER INSERT ON ai_api_usage
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_budgets();

-- ====================================================================================
-- COMMENTS
-- ====================================================================================

COMMENT ON TABLE ai_api_usage IS 'Tracks every AI API call with accurate token counts and costs';
COMMENT ON TABLE engine_config_backups IS 'Backs up engine configurations before upgrades';
COMMENT ON TABLE cost_budgets IS 'Defines cost budgets and alert thresholds';
COMMENT ON TABLE cost_alerts IS 'Logs cost alerts when budgets exceed thresholds';
COMMENT ON MATERIALIZED VIEW model_usage_summary IS 'Pre-aggregated model usage statistics for fast queries';

-- ====================================================================================
-- PERMISSIONS
-- ====================================================================================

-- Grant appropriate permissions (adjust as needed for your security model)
GRANT SELECT, INSERT ON ai_api_usage TO PUBLIC;
GRANT SELECT ON engine_config_backups TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON cost_budgets TO PUBLIC;
GRANT SELECT ON cost_alerts TO PUBLIC;
GRANT SELECT ON model_usage_summary TO PUBLIC;

-- ====================================================================================
-- SEED DATA (Optional)
-- ====================================================================================

-- Add a default global budget (optional - can be configured by admins)
-- INSERT INTO cost_budgets (scope_type, budget_period, budget_amount, period_start, period_end)
-- VALUES ('global', 'monthly', 1000.00, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month');

-- ====================================================================================
-- END OF MIGRATION 047
-- ====================================================================================
