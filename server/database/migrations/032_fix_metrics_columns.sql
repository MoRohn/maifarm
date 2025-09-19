-- Migration to add missing name column to metrics table

-- Add missing name column if it doesn't exist
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);