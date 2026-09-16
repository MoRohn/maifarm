-- Fix: Set setup_completed_at for all users who don't have it set
-- This prevents the welcome page redirect loop

UPDATE users
SET setup_completed_at = COALESCE(setup_completed_at, created_at, NOW())
WHERE setup_completed_at IS NULL;

-- Verify the fix
SELECT
  id,
  email,
  created_at,
  setup_completed_at,
  CASE
    WHEN setup_completed_at IS NOT NULL THEN '✓ Fixed'
    ELSE '✗ Still NULL'
  END as status
FROM users
ORDER BY created_at DESC
LIMIT 10;
