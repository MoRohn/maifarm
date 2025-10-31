-- =====================================================
-- Clean Corrupted Farms and Agents
-- =====================================================
-- This script removes all farms with corrupted agent data
-- and resets the system to a clean state

BEGIN;

-- 1. Count current corrupted agents (where name is a JSON object)
SELECT 'Corrupted agents (JSON names):' as description, COUNT(*) as count
FROM agents
WHERE name::text LIKE '{%';

-- 2. Count agents with wrong type
SELECT 'Agents with wrong type:' as description, COUNT(*) as count
FROM agents
WHERE type NOT IN ('primary', 'secondary', 'specialized');

-- 3. List farms with corrupted agents
SELECT 'Farms with corrupted agents:' as description;
SELECT DISTINCT f.id, f.name, f.status, f.created_at
FROM farms f
INNER JOIN agents a ON f.id = a.farm_id
WHERE a.name::text LIKE '{%'
   OR a.type NOT IN ('primary', 'secondary', 'specialized')
ORDER BY f.created_at DESC;

-- 4. Delete all agents (will cascade or we'll handle manually)
DELETE FROM agents;

-- 5. Delete all farms
DELETE FROM farms;

-- 6. Delete all harvests
DELETE FROM harvests;

-- 7. Verify clean state
SELECT 'Remaining farms:' as description, COUNT(*) as count FROM farms;
SELECT 'Remaining agents:' as description, COUNT(*) as count FROM agents;
SELECT 'Remaining harvests:' as description, COUNT(*) as count FROM harvests;

COMMIT;

-- Success message
SELECT '✅ Database cleaned successfully!' as result;
SELECT 'All farms, agents, and harvests have been removed.' as message;
SELECT 'You can now test farm launches with the fixes applied.' as next_step;
