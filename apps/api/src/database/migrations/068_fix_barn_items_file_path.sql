-- Migration 068: Fix barn_items file_path column
-- CRITICAL FIX: The code was saving to wrong column name (path instead of file_path)
-- This migration documents the fix. The barnService now has self-healing code that
-- reconstructs paths from harvestId when file_path is null.

-- NOTE: Paths are computed at runtime based on MAIFARM_ROOT environment variable.
-- The barnService.rowToBarnItem() method handles null file_path by computing:
--   - Harvest items: path.join(barnPath, 'harvests', metadata.harvestId)
--   - Other items: path.join(barnPath, 'items', item.id)
-- This makes the system self-healing without requiring a migration update.

-- For reference, the fix was:
-- 1. rowToBarnItem: Changed row.path to row.file_path
-- 2. saveBarnItemWithClient: Changed column 'path' to 'file_path'
-- 3. Added self-healing path reconstruction for legacy records

-- Log the documentation
DO $$
BEGIN
  RAISE NOTICE 'Migration 068: barnService now self-heals null file_path values at runtime';
END $$;
