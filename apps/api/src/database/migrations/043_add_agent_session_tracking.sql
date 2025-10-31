-- ============================================
-- Migration 043: Add Agent Session Tracking
-- ============================================
-- Adds critical columns for agent-tmux session coordination
-- Required for proper agent lifecycle management
--
-- Date: 2025-10-02
-- Author: System
-- Dependencies: 001_core_schema.sql
-- ============================================

-- Add session tracking columns to agents table
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS session_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS pane_index INTEGER;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_agents_session_name
ON agents(session_name)
WHERE session_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agents_session_pane
ON agents(session_name, pane_index)
WHERE session_name IS NOT NULL AND pane_index IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN agents.session_name IS 'Tmux session name (e.g., farm-cc550732) for agent lifecycle tracking';
COMMENT ON COLUMN agents.pane_index IS 'Tmux pane index (0-based) within the session';

-- Update existing agents to have session_name from tmux_session if available
UPDATE agents
SET session_name = tmux_session
WHERE session_name IS NULL AND tmux_session IS NOT NULL;

-- Validation: Check that the columns exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'session_name'
    ) THEN
        RAISE EXCEPTION 'Migration failed: session_name column not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'pane_index'
    ) THEN
        RAISE EXCEPTION 'Migration failed: pane_index column not created';
    END IF;

    RAISE NOTICE 'Migration 043 completed successfully';
END $$;
