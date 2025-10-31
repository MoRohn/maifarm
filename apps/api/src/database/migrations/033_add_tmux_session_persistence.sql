-- Add tmux session persistence columns to farms table
ALTER TABLE farms 
ADD COLUMN IF NOT EXISTS tmux_session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS tmux_created_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS tmux_window_target VARCHAR(50) DEFAULT '0',
ADD COLUMN IF NOT EXISTS session_preserved BOOLEAN DEFAULT FALSE;

-- Index for faster session lookups
CREATE INDEX IF NOT EXISTS idx_farms_tmux_session ON farms(tmux_session_id);

-- Update existing farms to mark XenoSync sessions as preserved
UPDATE farms 
SET session_preserved = TRUE 
WHERE provider = 'xenosync' AND status IN ('active', 'running', 'launching');