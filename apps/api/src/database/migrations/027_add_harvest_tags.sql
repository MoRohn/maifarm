-- Migration: Add tags column to harvests table
-- This column is used by harvest services to categorize and tag harvests

-- Add tags column to harvests table
ALTER TABLE harvests 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add index for better query performance on tags
CREATE INDEX IF NOT EXISTS idx_harvests_tags ON harvests USING GIN(tags);

-- Add comment explaining the column
COMMENT ON COLUMN harvests.tags IS 'Array of tags for categorizing and filtering harvests';

-- Update existing harvests to have default tags based on their type
UPDATE harvests 
SET tags = ARRAY[type, 'migrated']
WHERE tags IS NULL OR array_length(tags, 1) IS NULL;