-- Add missing columns for session preservation
-- These columns are needed for farm lifecycle management

-- Add tmux_session_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'farms' 
        AND column_name = 'tmux_session_id'
    ) THEN
        ALTER TABLE farms ADD COLUMN tmux_session_id VARCHAR(255);
    END IF;
END $$;

-- Add session_preserved column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'farms' 
        AND column_name = 'session_preserved'
    ) THEN
        ALTER TABLE farms ADD COLUMN session_preserved BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_farms_tmux_session_id ON farms(tmux_session_id);
CREATE INDEX IF NOT EXISTS idx_farms_session_preserved ON farms(session_preserved);