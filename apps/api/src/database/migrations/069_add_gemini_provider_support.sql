-- Migration 069: Add Gemini Provider Support
-- Extends AI provider support to include Google Gemini
-- Created: 2026-01-20

-- ====================================================================================
-- UPDATE PROVIDER CONSTRAINTS TO INCLUDE GEMINI
-- ====================================================================================

-- Drop old constraint on ai_api_usage if it exists
ALTER TABLE ai_api_usage
  DROP CONSTRAINT IF EXISTS valid_provider;

-- Add new constraint including gemini
ALTER TABLE ai_api_usage
  ADD CONSTRAINT valid_provider
  CHECK (provider IN ('claude', 'openai', 'grok', 'gemini', 'gpt-oss', 'llama', 'ollama'));

-- Drop old constraint on engine_config_backups if it exists
ALTER TABLE engine_config_backups
  DROP CONSTRAINT IF EXISTS valid_backup_provider;

-- Add new constraint including gemini
ALTER TABLE engine_config_backups
  ADD CONSTRAINT valid_backup_provider
  CHECK (provider IN ('claude', 'openai', 'grok', 'gemini', 'gpt-oss', 'llama', 'ollama'));

-- ====================================================================================
-- ADD GEMINI TO AI ENGINES TABLE (if it exists)
-- ====================================================================================

-- Insert Gemini engines into ai_engines table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_engines') THEN
    INSERT INTO ai_engines (provider, name, display_name, is_enabled, is_local, created_at)
    VALUES
      ('gemini', 'gemini-1.5-pro', 'Gemini 1.5 Pro', true, false, NOW()),
      ('gemini', 'gemini-1.5-flash', 'Gemini 1.5 Flash', true, false, NOW()),
      ('gemini', 'gemini-2.0-flash', 'Gemini 2.0 Flash', true, false, NOW()),
      ('gemini', 'gemini-2.0-flash-thinking', 'Gemini 2.0 Flash Thinking', true, false, NOW())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ====================================================================================
-- ADD GEMINI TO DEFAULT COST RATES (if cost_rates table exists)
-- ====================================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cost_rates') THEN
    INSERT INTO cost_rates (provider, model, cost_per_1k_input_tokens, cost_per_1k_output_tokens, effective_date)
    VALUES
      ('gemini', 'gemini-1.5-pro', 1.25, 5.0, NOW()),
      ('gemini', 'gemini-1.5-flash', 0.075, 0.3, NOW()),
      ('gemini', 'gemini-2.0-flash', 0.1, 0.4, NOW()),
      ('gemini', 'gemini-2.0-flash-thinking', 0.1, 0.4, NOW())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ====================================================================================
-- UPDATE SETTINGS TO RECOGNIZE GEMINI AS VALID PROVIDER
-- ====================================================================================

-- Insert Gemini as a valid provider option in settings
INSERT INTO settings (key, value, created_at, updated_at)
VALUES ('gemini_supported', 'true', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();

-- ====================================================================================
-- VERIFICATION QUERY (for debugging)
-- ====================================================================================

-- Verify the constraints were updated
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('valid_provider', 'valid_backup_provider');
