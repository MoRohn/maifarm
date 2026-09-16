-- Simple script to clear all users from the database
-- This will allow fresh account creation

-- Clear all users (cascade will handle foreign key dependencies)
TRUNCATE TABLE users CASCADE;

-- Verify deletion
SELECT COUNT(*) as user_count FROM users;
SELECT 'All user data has been cleared successfully!' as status;