-- Migration: Create token usage table for cost tracking
-- Created: 2025-08-05

-- Create token usage table
CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  model VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  task_id VARCHAR(255),
  farm_id VARCHAR(255),
  agent_id VARCHAR(255),
  input_cost DECIMAL(10, 6),
  output_cost DECIMAL(10, 6),
  total_cost DECIMAL(10, 6),
  currency VARCHAR(10) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
CREATE INDEX IF NOT EXISTS idx_token_usage_farm_id ON token_usage(farm_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent_id ON token_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_task_id ON token_usage(task_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);

-- Create a composite index for cost queries
CREATE INDEX IF NOT EXISTS idx_token_usage_cost_queries ON token_usage(provider, model, timestamp);

-- Add comments
COMMENT ON TABLE token_usage IS 'Tracks token usage and costs for AI provider API calls';
COMMENT ON COLUMN token_usage.input_tokens IS 'Number of input tokens consumed';
COMMENT ON COLUMN token_usage.output_tokens IS 'Number of output tokens generated';
COMMENT ON COLUMN token_usage.total_tokens IS 'Total tokens (input + output)';
COMMENT ON COLUMN token_usage.model IS 'AI model used (e.g., claude-3-opus, qwen-coder-480b)';
COMMENT ON COLUMN token_usage.provider IS 'AI provider (claude or qwen)';
COMMENT ON COLUMN token_usage.timestamp IS 'When the API call was made';
COMMENT ON COLUMN token_usage.input_cost IS 'Cost for input tokens in USD';
COMMENT ON COLUMN token_usage.output_cost IS 'Cost for output tokens in USD';
COMMENT ON COLUMN token_usage.total_cost IS 'Total cost (input + output) in USD';

-- Create a view for daily cost aggregation
CREATE OR REPLACE VIEW daily_cost_summary AS
SELECT 
  DATE(timestamp) as date,
  provider,
  model,
  COUNT(*) as api_calls,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(input_cost) as total_input_cost,
  SUM(output_cost) as total_output_cost,
  SUM(total_cost) as total_cost,
  AVG(total_cost) as avg_cost_per_call
FROM token_usage
GROUP BY DATE(timestamp), provider, model
ORDER BY date DESC, provider, model;

-- Create a view for farm cost tracking
CREATE OR REPLACE VIEW farm_cost_summary AS
SELECT 
  farm_id,
  provider,
  COUNT(*) as api_calls,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(total_cost) as avg_cost_per_call,
  MIN(timestamp) as first_call,
  MAX(timestamp) as last_call
FROM token_usage
WHERE farm_id IS NOT NULL
GROUP BY farm_id, provider;

-- Create a view for agent cost tracking
CREATE OR REPLACE VIEW agent_cost_summary AS
SELECT 
  agent_id,
  provider,
  COUNT(*) as api_calls,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(total_cost) as avg_cost_per_call,
  MIN(timestamp) as first_call,
  MAX(timestamp) as last_call
FROM token_usage
WHERE agent_id IS NOT NULL
GROUP BY agent_id, provider;