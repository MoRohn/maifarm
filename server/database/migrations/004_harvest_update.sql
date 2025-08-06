-- Update harvests table to match the Harvest type structure

-- First, rename existing columns that don't match
ALTER TABLE harvests RENAME COLUMN name TO farm_name_old;
ALTER TABLE harvests RENAME COLUMN created_by TO user_id;

-- Add new columns to match Harvest interface
ALTER TABLE harvests 
    ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS results JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS insights JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS quality JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS export_formats TEXT[] DEFAULT ARRAY['json', 'markdown', 'pdf'],
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Update status values to match our type
ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvests_status_check;
ALTER TABLE harvests 
    ADD CONSTRAINT harvests_status_check 
    CHECK (status IN ('processing', 'ready', 'archived', 'failed'));

-- Update the default status
ALTER TABLE harvests ALTER COLUMN status SET DEFAULT 'processing';

-- Drop the old type constraint that doesn't match our structure
ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvests_type_check;
ALTER TABLE harvests DROP COLUMN IF EXISTS type;

-- Clean up columns we don't need
ALTER TABLE harvests DROP COLUMN IF EXISTS name;
ALTER TABLE harvests DROP COLUMN IF EXISTS category;
ALTER TABLE harvests DROP COLUMN IF EXISTS parent_harvest_id;
ALTER TABLE harvests DROP COLUMN IF EXISTS version;
ALTER TABLE harvests DROP COLUMN IF EXISTS last_used_at;
ALTER TABLE harvests DROP COLUMN IF EXISTS use_count;
ALTER TABLE harvests DROP COLUMN IF EXISTS farm_name_old;

-- Ensure farm_name is properly set
UPDATE harvests SET farm_name = COALESCE(farm_name, 'Unknown Farm');

-- Add index for user_id
CREATE INDEX IF NOT EXISTS idx_harvests_user_id ON harvests(user_id);