-- Clear all user-related data from MaiFarm database
-- WARNING: This will delete all user accounts and related data!

BEGIN;

-- First, disable foreign key constraints temporarily
SET CONSTRAINTS ALL DEFERRED;

-- Clear dependent tables first (only if they exist)
DELETE FROM access_tokens WHERE user_id IS NOT NULL;
DELETE FROM api_keys WHERE user_id IS NOT NULL;
DELETE FROM security_audits WHERE user_id IS NOT NULL;
DELETE FROM farms WHERE created_by_user_id IS NOT NULL;
DELETE FROM harvests WHERE user_id IS NOT NULL;
DELETE FROM token_usage WHERE user_id IS NOT NULL;

-- Clear the users table
DELETE FROM users;

-- Reset any sequences if needed (optional)
-- ALTER SEQUENCE users_id_seq RESTART WITH 1;

-- Re-enable constraints
SET CONSTRAINTS ALL IMMEDIATE;

COMMIT;

-- Verify deletion
SELECT COUNT(*) as user_count FROM users;
SELECT 'All user data has been cleared successfully!' as status;