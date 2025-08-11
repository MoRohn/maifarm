-- Migration to enhance farm and harvest persistence
-- This ensures farms and harvests persist properly in the database

-- Add missing columns to farms table if they don't exist
ALTER TABLE farms ADD COLUMN IF NOT EXISTS farmer_template_id UUID;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS farmer_template_name VARCHAR(255);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'collaborative';

-- Update the status check constraint to include all possible statuses
ALTER TABLE farms DROP CONSTRAINT IF EXISTS farms_status_check;
ALTER TABLE farms ADD CONSTRAINT farms_status_check 
    CHECK (status IN ('preparing', 'running', 'paused', 'failed', 'terminated', 
                      'completed', 'stopped', 'harvesting', 'launching', 'active', 
                      'deleted', 'idle'));

-- Add persist_in_background flag to config JSONB if not present
UPDATE farms 
SET config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{persistInBackground}',
    'true'::jsonb,
    true
)
WHERE NOT (config ? 'persistInBackground');

-- Ensure harvests table has proper ON DELETE behavior
-- This ensures harvests persist even when farms are deleted
ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvests_farm_id_fkey;
ALTER TABLE harvests ADD CONSTRAINT harvests_farm_id_fkey 
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL;

-- Add indexes for better query performance on persistence operations
CREATE INDEX IF NOT EXISTS idx_farms_status_completed ON farms(status) 
    WHERE status IN ('completed', 'harvesting');
CREATE INDEX IF NOT EXISTS idx_harvests_farm_id_null ON harvests(farm_id) 
    WHERE farm_id IS NULL;

-- Update any farms that were stopped to be marked as completed if they have harvests
UPDATE farms f
SET status = 'completed'
WHERE f.status = 'stopped'
  AND EXISTS (
    SELECT 1 FROM harvests h 
    WHERE h.farm_id = f.id 
      AND h.status IN ('saved', 'processing', 'completed')
  );

-- Add a column to track deletion timestamp for soft deletes
ALTER TABLE farms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Create indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_farms_deleted_at ON farms(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_harvests_deleted_at ON harvests(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add a trigger to automatically set deleted_at when status changes to 'deleted'
CREATE OR REPLACE FUNCTION set_deleted_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'deleted' AND OLD.status != 'deleted' THEN
        NEW.deleted_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER farms_set_deleted_at
BEFORE UPDATE ON farms
FOR EACH ROW
EXECUTE FUNCTION set_deleted_timestamp();

-- Ensure all completed farms have their config properly set for persistence
UPDATE farms
SET config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{persistInBackground}',
    'true'::jsonb,
    true
)
WHERE status IN ('completed', 'harvesting');

-- Add comments for documentation
COMMENT ON COLUMN farms.deleted_at IS 'Timestamp when farm was soft deleted';
COMMENT ON COLUMN harvests.deleted_at IS 'Timestamp when harvest was soft deleted';
COMMENT ON COLUMN farms.farmer_template_id IS 'Reference to the farmer template used';
COMMENT ON COLUMN farms.farmer_template_name IS 'Name of the farmer template for display';