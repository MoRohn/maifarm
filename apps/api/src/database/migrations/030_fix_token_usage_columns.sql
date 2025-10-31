-- Migration to fix token_usage table columns to match CostTrackingService expectations

-- Add missing columns if they don't exist
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS task_id VARCHAR(255);
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Copy data from existing columns to new columns if they exist
UPDATE token_usage SET input_tokens = prompt_tokens WHERE input_tokens IS NULL AND prompt_tokens IS NOT NULL;
UPDATE token_usage SET output_tokens = completion_tokens WHERE output_tokens IS NULL AND completion_tokens IS NOT NULL;

-- Create indexes for new columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_token_usage_task_id ON token_usage(task_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_name ON token_usage(name);