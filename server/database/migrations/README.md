# Database Migration Consolidation

## Overview

This directory contains the consolidated database migrations for MaiFarm, reducing 25 fragmented migration files down to 5 comprehensive, well-organized migrations.

## Problem Solved

The original migration structure had:
- 25 migration files with duplicate numbering (016, 019, 020, 021, 022)
- Conflicting schema changes across files
- Disabled migrations causing confusion
- Difficult to understand schema evolution
- Risk of migration conflicts in production

## Consolidated Structure

### 001_core_schema.sql
**Consolidates:** 001_initial_schema, 016_system_users, 017_fix_created_by
- Core tables: users, farms, agents, tasks, sessions
- System user setup
- Tmux session tracking
- Farm lifecycle events
- Base indexes and triggers

### 002_monitoring_analytics.sql
**Consolidates:** 002_monitoring_schema, 007_token_usage, 013_thinking_strategy, 018_performance
- Monitoring: metrics, logs, health_checks
- Token usage tracking
- Thinking strategy metrics
- Provider metrics
- Alert system
- Audit logs
- Performance indexes

### 003_harvest_workflow.sql  
**Consolidates:** 003_harvests_seeds, 004_harvest_update, 009_farmer_templates, 010_enhance_seeds, 014_barn_sync, 020_gowild, 021_consolidation
- Seeds and harvests
- Barn items and sync
- Quick tasks
- GoWild sessions and discoveries
- Task checkpoints
- Workspace pool

### 004_security_api.sql
**Consolidates:** 005_provider_api_keys, 008_api_keys, 011_security_audits, 015_security_audits
- API keys management
- Security audits
- Vulnerability tracking
- Access tokens
- Permission grants
- Rate limiting
- Encryption keys
- Security audit trail

### 005_cluster_providers.sql
**Consolidates:** 006_load_balancing, 012_cross_provider, and remaining enhancements
- Cluster nodes
- Load balancer rules
- Provider pool
- Cross-provider messaging
- Provider bridges
- Resource pools
- Failover policies
- Extended agent metrics

## Migration Strategy

### For Fresh Installations
1. Run migrations in order:
   ```bash
   psql -U maifarm -d maifarm_dev -f 001_core_schema.sql
   psql -U maifarm -d maifarm_dev -f 002_monitoring_analytics.sql
   psql -U maifarm -d maifarm_dev -f 003_harvest_workflow.sql
   psql -U maifarm -d maifarm_dev -f 004_security_api.sql
   psql -U maifarm -d maifarm_dev -f 005_cluster_providers.sql
   ```

### For Existing Installations

1. **Backup your database first:**
   ```bash
   pg_dump -U maifarm -d maifarm_dev > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Check current migration state:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   ORDER BY table_name;
   ```

3. **Apply missing migrations only:**
   - If you have most tables, you likely only need 005_cluster_providers.sql
   - Check each consolidated migration against your schema
   - Apply only the CREATE TABLE IF NOT EXISTS statements

## Key Improvements

### 1. Status Constraints Fixed
- All status fields now have proper CHECK constraints
- Agent status includes all valid states from the unified type system
- Farm status supports all lifecycle states

### 2. Foreign Key Relationships
- Proper cascading deletes where appropriate
- Circular dependencies resolved with deferred constraints
- Seeds ↔ Farms relationship properly handled

### 3. Performance Optimizations
- Strategic indexes on frequently queried columns
- Composite indexes for complex queries
- Partial indexes for filtered queries
- Full-text search indexes where needed

### 4. Data Integrity
- UUID generation with uuid-ossp extension
- Proper timestamp defaults
- Update triggers for updated_at columns
- Check constraints for enums

### 5. Security Enhancements
- Encrypted API key storage
- Security audit trail
- Rate limiting support
- Permission grants system

## Rollback Plan

If issues occur, rollback using:

```sql
-- Drop all tables in reverse order
DROP TABLE IF EXISTS cluster_events CASCADE;
DROP TABLE IF EXISTS agent_metrics CASCADE;
DROP TABLE IF EXISTS failover_policies CASCADE;
DROP TABLE IF EXISTS resource_pools CASCADE;
DROP TABLE IF EXISTS provider_bridges CASCADE;
DROP TABLE IF EXISTS cross_provider_messages CASCADE;
DROP TABLE IF EXISTS provider_pool CASCADE;
DROP TABLE IF EXISTS load_balancer_rules CASCADE;
DROP TABLE IF EXISTS cluster_nodes CASCADE;
-- ... continue for all tables

-- Restore from backup
psql -U maifarm -d maifarm_dev < backup_YYYYMMDD_HHMMSS.sql
```

## Testing Checklist

- [ ] Fresh database initialization works
- [ ] All constraints are properly enforced
- [ ] Foreign keys maintain referential integrity
- [ ] Indexes improve query performance
- [ ] Update triggers work correctly
- [ ] No duplicate key violations
- [ ] Application connects and operates normally

## Notes

- These migrations use PostgreSQL-specific features
- Requires PostgreSQL 12+ for full feature support
- Extensions required: uuid-ossp, pgcrypto, pg_trgm
- Total schema size: ~90 tables with full indexes