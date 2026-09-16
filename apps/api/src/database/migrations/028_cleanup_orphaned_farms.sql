-- Migration: Clean up orphaned farms and add recovery tracking
-- This helps prevent endless recovery attempts for dead farms

-- Add recovery_attempts column to farms table if not exists
ALTER TABLE farms 
ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER DEFAULT 0;

-- Add last_recovery_attempt timestamp
ALTER TABLE farms 
ADD COLUMN IF NOT EXISTS last_recovery_attempt TIMESTAMP;

-- Mark farms as unrecoverable if they've been in failed/stopped state for over an hour
-- and have had multiple recovery attempts
UPDATE farms 
SET status = 'failed'
WHERE status IN ('stopped', 'failed', 'error')
  AND created_at < NOW() - INTERVAL '1 hour'
  AND recovery_attempts >= 3;

-- Clean up very old farms that never properly completed
-- These are farms older than 24 hours that aren't completed or saved
DELETE FROM farms 
WHERE status NOT IN ('completed', 'saved', 'harvested')
  AND created_at < NOW() - INTERVAL '24 hours'
  AND (last_activity IS NULL OR last_activity < NOW() - INTERVAL '24 hours');

-- Add index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_farms_cleanup 
ON farms(status, created_at, last_activity) 
WHERE status NOT IN ('completed', 'saved', 'harvested');

-- Add comment explaining the columns
COMMENT ON COLUMN farms.recovery_attempts IS 'Number of times recovery was attempted for this farm';
COMMENT ON COLUMN farms.last_recovery_attempt IS 'Timestamp of the last recovery attempt';