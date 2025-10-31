-- ============================================
-- CONSOLIDATED MIGRATION ROLLBACK SCRIPT
-- Version: 999 (Rollback for Consolidated Schema)
-- Created: 2025-01-09
-- Purpose: Safely rollback the consolidated migration
-- ============================================
-- 
-- WARNING: This will DELETE ALL DATA! 
-- Make sure you have a backup before running this script!
--
-- This script removes all tables, functions, and objects created by 
-- the consolidated migration (999_consolidated_schema.sql).

BEGIN;

-- ============================================
-- DISABLE SAFETY CHECKS TEMPORARILY
-- ============================================

-- Disable foreign key checks to allow table dropping
SET session_replication_role = 'replica';

-- ============================================
-- DROP TRIGGERS FIRST
-- ============================================

-- Drop all update triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_farms_updated_at ON farms;
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
DROP TRIGGER IF EXISTS update_tmux_sessions_updated_at ON tmux_sessions;
DROP TRIGGER IF EXISTS update_seeds_updated_at ON seeds;
DROP TRIGGER IF EXISTS update_harvests_updated_at ON harvests;
DROP TRIGGER IF EXISTS update_harvest_manifests_updated_at ON harvest_manifests;
DROP TRIGGER IF EXISTS update_barn_items_updated_at ON barn_items;
DROP TRIGGER IF EXISTS update_workspace_pool_updated_at ON workspace_pool;
DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
DROP TRIGGER IF EXISTS update_security_audits_updated_at ON security_audits;
DROP TRIGGER IF EXISTS update_thinking_preferences_updated_at ON thinking_preferences;
DROP TRIGGER IF EXISTS update_thinking_recommendations_updated_at ON thinking_recommendations;
DROP TRIGGER IF EXISTS update_alert_rules_updated_at ON alert_rules;

-- Drop token usage sync trigger
DROP TRIGGER IF EXISTS sync_token_usage_columns_trigger ON token_usage;

-- Drop health check trigger
DROP TRIGGER IF EXISTS farm_health_check_trigger ON farms;

-- ============================================
-- DROP TABLES (Order matters due to foreign keys)
-- ============================================

-- Drop dependent tables first (those with foreign keys)

-- Thinking system tables
DROP TABLE IF EXISTS thinking_recommendations CASCADE;
DROP TABLE IF EXISTS thinking_preferences CASCADE;
DROP TABLE IF EXISTS thinking_metrics CASCADE;

-- Task system tables
DROP TABLE IF EXISTS task_checkpoints CASCADE;

-- GoWild system tables
DROP TABLE IF EXISTS gowild_checkpoints CASCADE;
DROP TABLE IF EXISTS gowild_discoveries CASCADE;
DROP TABLE IF EXISTS gowild_sessions CASCADE;

-- Quick tasks
DROP TABLE IF EXISTS quick_tasks CASCADE;

-- Barn system tables
DROP TABLE IF EXISTS barn_sync_log CASCADE;
DROP TABLE IF EXISTS barn_items CASCADE;

-- Harvest system tables
DROP TABLE IF EXISTS harvest_manifests CASCADE;
DROP TABLE IF EXISTS harvest_yield CASCADE;
DROP TABLE IF EXISTS harvests CASCADE;
DROP TABLE IF EXISTS seeds CASCADE;

-- Workspace management
DROP TABLE IF EXISTS workspace_pool CASCADE;

-- Health and monitoring tables
DROP TABLE IF EXISTS session_crash_log CASCADE;
DROP TABLE IF EXISTS session_health_log CASCADE;
DROP TABLE IF EXISTS agent_health_checks CASCADE;
DROP TABLE IF EXISTS health_checks CASCADE;

-- Alert system
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS alert_rules CASCADE;

-- Token usage and provider metrics
DROP TABLE IF EXISTS token_usage CASCADE;
DROP TABLE IF EXISTS provider_metrics CASCADE;

-- Audit and security
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS security_audits CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;

-- Monitoring and analytics
DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS metrics CASCADE;

-- Core system tables
DROP TABLE IF EXISTS farm_lifecycle_events CASCADE;
DROP TABLE IF EXISTS tmux_sessions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS farms CASCADE;

-- Session and settings
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- User system (last due to foreign keys)
DROP TABLE IF EXISTS users CASCADE;

-- Migration tracking
DROP TABLE IF EXISTS schema_migrations CASCADE;

-- ============================================
-- DROP FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS get_farm_health_status(UUID) CASCADE;
DROP FUNCTION IF EXISTS sync_token_usage_columns() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================
-- DROP EXTENSIONS (Optional - be careful!)
-- ============================================

-- Uncomment these lines ONLY if these extensions are not used by other databases
-- and you're sure you want to remove them completely from PostgreSQL

-- DROP EXTENSION IF EXISTS "pg_trgm";
-- DROP EXTENSION IF EXISTS "pgcrypto";

-- ============================================
-- RE-ENABLE SAFETY CHECKS
-- ============================================

-- Re-enable foreign key checks
SET session_replication_role = 'origin';

-- ============================================
-- RECORD ROLLBACK IN LOG (if possible)
-- ============================================

-- Note: This will fail if schema_migrations table was dropped
-- That's expected and okay
DO $$
BEGIN
    BEGIN
        INSERT INTO schema_migrations (version, filename, applied_at, success, error_message)
        VALUES (
            '999_rollback', 
            '999_consolidated_rollback.sql',
            CURRENT_TIMESTAMP,
            TRUE,
            'Consolidated schema rollback completed'
        );
    EXCEPTION WHEN OTHERS THEN
        -- Table doesn't exist, which is expected
        NULL;
    END;
END $$;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these queries to verify the rollback
DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    trigger_count INTEGER;
BEGIN
    -- Count remaining tables
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    
    -- Count remaining functions (should be minimal system functions only)
    SELECT COUNT(*) INTO function_count 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    
    -- Count remaining triggers
    SELECT COUNT(*) INTO trigger_count 
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public';
    
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'CONSOLIDATED MIGRATION ROLLBACK COMPLETED';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Remaining tables: %', table_count;
    RAISE NOTICE 'Remaining functions: %', function_count;
    RAISE NOTICE 'Remaining triggers: %', trigger_count;
    RAISE NOTICE '====================================================';
    
    IF table_count = 0 THEN
        RAISE NOTICE '✅ All MaiFarm tables have been removed';
    ELSE
        RAISE NOTICE '⚠️  Some tables remain - check manually';
    END IF;
    
    RAISE NOTICE 'Database has been reset to clean state';
    RAISE NOTICE '====================================================';
END $$;

-- ============================================
-- MANUAL VERIFICATION QUERIES
-- ============================================

-- Run these queries after the rollback to verify:

-- Check for any remaining tables
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Check for any remaining functions
-- SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public';

-- Check for any remaining triggers
-- SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public';

-- Check for any remaining indexes
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public';

-- If you need to completely reset PostgreSQL roles/users (BE CAREFUL!)
-- DROP ROLE IF EXISTS maifarm;

-- End of Rollback Script