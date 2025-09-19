-- ============================================
-- ROLLBACK SCRIPT FOR CONSOLIDATED MIGRATIONS
-- ============================================
-- Run this script to completely remove all tables created by the migrations
-- WARNING: This will DELETE ALL DATA! Make sure you have a backup!

BEGIN;

-- Disable foreign key checks temporarily
SET session_replication_role = 'replica';

-- ============================================
-- DROP TABLES FROM MIGRATION 005 (Cluster & Providers)
-- ============================================
DROP TABLE IF EXISTS agent_metrics CASCADE;
DROP TABLE IF EXISTS cluster_events CASCADE;
DROP TABLE IF EXISTS failover_policies CASCADE;
DROP TABLE IF EXISTS resource_pools CASCADE;
DROP TABLE IF EXISTS provider_bridges CASCADE;
DROP TABLE IF EXISTS cross_provider_messages CASCADE;
DROP TABLE IF EXISTS provider_pool CASCADE;
DROP TABLE IF EXISTS load_balancer_rules CASCADE;
DROP TABLE IF EXISTS cluster_nodes CASCADE;

-- ============================================
-- DROP TABLES FROM MIGRATION 004 (Security & API)
-- ============================================
DROP TABLE IF EXISTS security_audit_trail CASCADE;
DROP TABLE IF EXISTS encryption_keys CASCADE;
DROP TABLE IF EXISTS rate_limits CASCADE;
DROP TABLE IF EXISTS permission_grants CASCADE;
DROP TABLE IF EXISTS access_tokens CASCADE;
DROP TABLE IF EXISTS vulnerabilities CASCADE;
DROP TABLE IF EXISTS security_audits CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;

-- ============================================
-- DROP TABLES FROM MIGRATION 003 (Harvest & Workflow)
-- ============================================
DROP TABLE IF EXISTS workspace_pool CASCADE;
DROP TABLE IF EXISTS task_checkpoints CASCADE;
DROP TABLE IF EXISTS gowild_checkpoints CASCADE;
DROP TABLE IF EXISTS gowild_discoveries CASCADE;
DROP TABLE IF EXISTS gowild_sessions CASCADE;
DROP TABLE IF EXISTS quick_tasks CASCADE;
DROP TABLE IF EXISTS barn_sync_log CASCADE;
DROP TABLE IF EXISTS barn_items CASCADE;
DROP TABLE IF EXISTS harvest_manifests CASCADE;
DROP TABLE IF EXISTS harvest_yield CASCADE;
DROP TABLE IF EXISTS harvests CASCADE;
DROP TABLE IF EXISTS seeds CASCADE;

-- ============================================
-- DROP TABLES FROM MIGRATION 002 (Monitoring & Analytics)
-- ============================================
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS provider_metrics CASCADE;
DROP TABLE IF EXISTS thinking_recommendations CASCADE;
DROP TABLE IF EXISTS thinking_preferences CASCADE;
DROP TABLE IF EXISTS thinking_metrics CASCADE;
DROP TABLE IF EXISTS alert_rules CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS token_usage CASCADE;
DROP TABLE IF EXISTS agent_health_checks CASCADE;
DROP TABLE IF EXISTS health_checks CASCADE;
DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS metrics CASCADE;

-- ============================================
-- DROP TABLES FROM MIGRATION 001 (Core Schema)
-- ============================================
DROP TABLE IF EXISTS farm_lifecycle_events CASCADE;
DROP TABLE IF EXISTS tmux_sessions CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS farms CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- DROP FUNCTIONS
-- ============================================
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================
-- DROP EXTENSIONS (Optional - comment out if used by other databases)
-- ============================================
-- DROP EXTENSION IF EXISTS "pg_trgm";
-- DROP EXTENSION IF EXISTS "pgcrypto";
-- DROP EXTENSION IF EXISTS "uuid-ossp";

-- Re-enable foreign key checks
SET session_replication_role = 'origin';

COMMIT;

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this query to verify all tables are removed:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';