-- Migration 042: Update farm status constraint and ensure crash columns

BEGIN;

-- Ensure crash tracking columns exist (idempotent)
ALTER TABLE farms
    ADD COLUMN IF NOT EXISTS crash_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_crash_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_recovery_at TIMESTAMP;

-- Update status constraint to include expanded set used by orchestrators
ALTER TABLE farms DROP CONSTRAINT IF EXISTS farms_status_check;
ALTER TABLE farms
    ADD CONSTRAINT farms_status_check CHECK (status IN (
        'idle', 'launching', 'active', 'running', 'paused',
        'harvesting', 'completed', 'failed', 'terminated',
        'preparing', 'stopped', 'deleted', 'crashed',
        'recovering', 'stale'
    ));

COMMIT;
