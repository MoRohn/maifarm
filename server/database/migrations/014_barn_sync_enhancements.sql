-- Migration: Add barn synchronization enhancements
-- Description: Add columns and tables for barn sync, storage stats, and archive management

-- Add columns to barn_items table for sync and archive support
ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS file_count INTEGER DEFAULT 1;
ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE barn_items ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pending';

-- Create barn_sync_log table to track sync operations
CREATE TABLE IF NOT EXISTS barn_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  items_scanned INTEGER DEFAULT 0,
  items_added INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_archived INTEGER DEFAULT 0,
  orphaned_cleaned INTEGER DEFAULT 0,
  errors TEXT[],
  status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
  sync_type VARCHAR(50) DEFAULT 'manual',
  triggered_by VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_barn_items_archived_at ON barn_items(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_barn_items_last_synced_at ON barn_items(last_synced_at);
CREATE INDEX IF NOT EXISTS idx_barn_items_file_size ON barn_items(file_size);
CREATE INDEX IF NOT EXISTS idx_barn_sync_log_status ON barn_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_barn_sync_log_started_at ON barn_sync_log(started_at DESC);

-- Create storage_stats view for quick statistics
CREATE OR REPLACE VIEW barn_storage_stats AS
SELECT 
  COUNT(*) as total_items,
  COUNT(CASE WHEN archived_at IS NULL THEN 1 END) as active_items,
  COUNT(CASE WHEN archived_at IS NOT NULL THEN 1 END) as archived_items,
  COALESCE(SUM(file_size), 0) as total_size,
  COALESCE(SUM(file_count), 0) as total_files,
  MIN(created_at) as oldest_item,
  MAX(created_at) as newest_item,
  AVG(file_size) as avg_file_size
FROM barn_items;

-- Create function to auto-archive old items
CREATE OR REPLACE FUNCTION auto_archive_old_barn_items(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  UPDATE barn_items 
  SET archived_at = CURRENT_TIMESTAMP,
      sync_status = 'archived'
  WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * days_old
    AND archived_at IS NULL;
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to cleanup orphaned entries
CREATE OR REPLACE FUNCTION cleanup_orphaned_barn_items()
RETURNS TABLE(deleted_count INTEGER, error_count INTEGER) AS $$
DECLARE
  del_count INTEGER := 0;
  err_count INTEGER := 0;
BEGIN
  -- This would be enhanced with actual filesystem checks
  -- For now, just remove items marked as orphaned
  DELETE FROM barn_items 
  WHERE sync_status = 'orphaned'
    AND last_synced_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
  
  GET DIAGNOSTICS del_count = ROW_COUNT;
  
  RETURN QUERY SELECT del_count, err_count;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update last_synced_at on barn_items update
CREATE OR REPLACE FUNCTION update_barn_item_sync_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_synced_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER barn_items_sync_timestamp
  BEFORE UPDATE ON barn_items
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION update_barn_item_sync_timestamp();

-- Add comments for documentation
COMMENT ON TABLE barn_sync_log IS 'Tracks all barn synchronization operations with filesystem';
COMMENT ON COLUMN barn_items.archived_at IS 'Timestamp when item was archived';
COMMENT ON COLUMN barn_items.file_size IS 'Total size of all files in this barn item in bytes';
COMMENT ON COLUMN barn_items.file_count IS 'Number of files in this barn item';
COMMENT ON COLUMN barn_items.last_synced_at IS 'Last time this item was synchronized with filesystem';
COMMENT ON COLUMN barn_items.sync_status IS 'Current sync status: pending, synced, error, orphaned, archived';