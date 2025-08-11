-- Add farmer template tracking to farms and harvests

-- Add farmer template columns to farms table
ALTER TABLE farms ADD COLUMN IF NOT EXISTS farmer_template_id VARCHAR(255);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS farmer_template_name VARCHAR(255);

-- Add farmer template columns to harvests table  
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS farmer_template_id VARCHAR(255);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS farmer_template_name VARCHAR(255);

-- Add farmer template columns to barn_items table for better tracking
ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS farmer_template_id VARCHAR(255);
ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS farmer_template_name VARCHAR(255);

-- Add farmer template columns to quick_tasks table
ALTER TABLE quick_tasks ADD COLUMN IF NOT EXISTS farmer_template_id VARCHAR(255);
ALTER TABLE quick_tasks ADD COLUMN IF NOT EXISTS farmer_template_name VARCHAR(255);

-- Create indexes for farmer template queries
CREATE INDEX IF NOT EXISTS idx_farms_farmer_template_id ON farms(farmer_template_id);
CREATE INDEX IF NOT EXISTS idx_harvests_farmer_template_id ON harvests(farmer_template_id);
CREATE INDEX IF NOT EXISTS idx_barn_items_farmer_template_id ON barn_items(farmer_template_id);
CREATE INDEX IF NOT EXISTS idx_quick_tasks_farmer_template_id ON quick_tasks(farmer_template_id);

-- Add comments for documentation
COMMENT ON COLUMN farms.farmer_template_id IS 'ID of the farmer template used to create this farm';
COMMENT ON COLUMN farms.farmer_template_name IS 'Display name of the farmer template used';
COMMENT ON COLUMN harvests.farmer_template_id IS 'ID of the farmer template that generated this harvest';
COMMENT ON COLUMN harvests.farmer_template_name IS 'Display name of the farmer template used';
COMMENT ON COLUMN barn_items.farmer_template_id IS 'ID of the farmer template that created the original harvest';
COMMENT ON COLUMN barn_items.farmer_template_name IS 'Display name of the farmer template used';
COMMENT ON COLUMN quick_tasks.farmer_template_id IS 'ID of the farmer template used for this quick task';
COMMENT ON COLUMN quick_tasks.farmer_template_name IS 'Display name of the farmer template used';