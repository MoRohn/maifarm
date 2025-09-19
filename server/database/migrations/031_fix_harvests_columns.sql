-- Migration to add missing columns to harvests table

-- Add missing columns if they don't exist
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS yield_value NUMERIC(10,2);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Create indexes for new columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_harvests_created_by ON harvests(created_by);
CREATE INDEX IF NOT EXISTS idx_harvests_yield_value ON harvests(yield_value);
CREATE INDEX IF NOT EXISTS idx_harvests_name ON harvests(name);