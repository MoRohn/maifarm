# MaiFarm Database Migration Guide

## Overview

This guide covers the consolidated database migration structure for MaiFarm. The migration system has been completely restructured to provide a clean, professional, and maintainable approach to database schema management.

## Migration Consolidation

### What Was Done

1. **Analyzed all existing migrations** (000-029) to understand the complete schema
2. **Identified and resolved issues**:
   - Duplicate migration files (`025_session_health_tracking.sql` and `025_session_health_tracking_simple.sql`)
   - Missing migrations (006-023 were never created)
   - Fragmented schema across many files
   - Column sync issues and missing foreign keys

3. **Created consolidated migration** (`999_consolidated_schema.sql`):
   - Combines all necessary schema changes
   - Uses `IF NOT EXISTS` clauses extensively for safety
   - Includes all fixes from recent migrations (026-029)
   - Provides comprehensive indexing strategy
   - Includes proper foreign key constraints
   - Features data migration and cleanup

### Migration History Consolidated

The consolidated migration includes changes from:

- **000**: Fix migration issues and core functions
- **001**: Core schema (users, farms, agents, tasks, sessions, settings)
- **002**: Monitoring & analytics (metrics, logs, health checks, token usage, alerts)
- **003**: Harvest & workflow (seeds, harvests, barn items, quick tasks, gowild)
- **004**: Security & API (api keys, security audits, access tokens, permissions)
- **005**: Cluster & providers (cluster nodes, load balancing, cross-provider)
- **024**: Column synchronization and aliases
- **025**: Session health tracking (consolidated from both versions)
- **026**: Harvest config fixes and default users
- **027**: Add harvest tags
- **028**: Cleanup orphaned farms and recovery tracking
- **029**: Fix barn sync log missing column

## Database Schema Structure

### Core Tables

1. **Users & Authentication**
   - `users` - User accounts and system user
   - `sessions` - User sessions
   - `api_keys` - API key management
   - `security_audits` - Security audit logs

2. **Farm Management**
   - `farms` - Main farm entities with comprehensive lifecycle tracking
   - `agents` - AI agents within farms
   - `tasks` - Task management and execution
   - `tmux_sessions` - Tmux session tracking
   - `farm_lifecycle_events` - Farm lifecycle event logging

3. **Health & Monitoring**
   - `session_health_log` - Session health check logs
   - `session_crash_log` - Session crash tracking
   - `agent_health_checks` - Agent health monitoring
   - `metrics` - System metrics collection
   - `logs` - Centralized logging
   - `alerts` - Alert management

4. **Harvest & Workflow**
   - `seeds` - Seed templates and configurations
   - `harvests` - Harvest collection and results
   - `harvest_yield` - Individual harvest items
   - `harvest_manifests` - Harvest file manifests
   - `barn_items` - Barn storage items
   - `barn_sync_log` - Barn synchronization logs

5. **GoWild System**
   - `gowild_sessions` - GoWild exploration sessions
   - `gowild_discoveries` - Discovered insights
   - `gowild_checkpoints` - Session checkpoints

6. **Quick Tasks**
   - `quick_tasks` - Quick task execution
   - `task_checkpoints` - Task state checkpoints

7. **Thinking Strategy**
   - `thinking_metrics` - Thinking strategy performance
   - `thinking_preferences` - User thinking preferences
   - `thinking_recommendations` - AI thinking recommendations

8. **Token Usage & Cost Tracking**
   - `token_usage` - Comprehensive token usage tracking with aliases
   - `provider_metrics` - AI provider performance metrics

9. **Workspace Management**
   - `workspace_pool` - Workspace allocation pool

10. **Audit & Compliance**
    - `audit_logs` - System audit trail

### Key Features

#### Safety First
- All table creation uses `IF NOT EXISTS`
- All foreign key additions are conditional
- All index creation uses `IF NOT EXISTS`
- Comprehensive error handling

#### Performance Optimized
- Strategic indexing for all query patterns
- GIN indexes for JSONB and array columns
- Partial indexes for filtered queries
- Proper foreign key constraints for data integrity

#### Migration Tracking
- `schema_migrations` table for version control
- Checksum validation
- Success/failure tracking
- Rollback support

## Usage Instructions

### For New Databases (Fresh Install)

1. **Run the consolidated migration**:
   ```sql
   -- Run this file against your database
   \i apps/api/src/database/migrations/999_consolidated_schema.sql
   ```

2. **Verify installation**:
   ```sql
   -- Check migration status
   SELECT * FROM schema_migrations ORDER BY applied_at DESC;
   
   -- Verify table count
   SELECT COUNT(*) as table_count 
   FROM information_schema.tables 
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
   ```

### For Existing Databases

1. **Backup your database first**:
   ```bash
   pg_dump maifarm_dev > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Run the consolidated migration**:
   ```sql
   -- The migration is designed to be safe on existing databases
   \i apps/api/src/database/migrations/999_consolidated_schema.sql
   ```

3. **Verify the migration**:
   ```sql
   -- Check for any missing tables or columns
   SELECT * FROM get_farm_health_status('00000000-0000-0000-0000-000000000000');
   ```

### Using the Node.js Migration Runner

The existing `UnifiedMigrationRunner` will automatically handle the migration:

```typescript
import { UnifiedMigrationRunner } from './apps/api/src/database/unifiedMigrationRunner';

const runner = new UnifiedMigrationRunner(pool);
const result = await runner.runMigrations();

if (result.success) {
  console.log(`Applied ${result.applied.length} migrations`);
} else {
  console.error('Migration failed:', result.errors);
}
```

## Migration Safety

### Built-in Safeguards

1. **Idempotent Operations**: All operations can be run multiple times safely
2. **Conditional Logic**: Extensive use of `IF NOT EXISTS` and `DO $$ ... END $$` blocks
3. **Transaction Safety**: Entire migration runs in a single transaction
4. **Rollback Support**: Transaction will roll back on any error
5. **Verification**: Post-migration verification checks

### Data Protection

- Existing data is preserved
- No destructive operations
- Proper handling of NULL values
- System user creation with conflict resolution
- Data migration for new columns

## Troubleshooting

### Common Issues

1. **Permission Errors**
   ```sql
   -- Ensure user has sufficient privileges
   GRANT ALL PRIVILEGES ON DATABASE maifarm_dev TO maifarm;
   GRANT ALL ON SCHEMA public TO maifarm;
   ```

2. **Extension Issues**
   ```sql
   -- Install required extensions
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   CREATE EXTENSION IF NOT EXISTS "pg_trgm";
   ```

3. **Constraint Conflicts**
   ```sql
   -- Check existing constraints
   SELECT constraint_name, table_name 
   FROM information_schema.table_constraints 
   WHERE table_schema = 'public';
   ```

### Verification Queries

```sql
-- Check table structure
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
ORDER BY table_name, ordinal_position;

-- Check foreign key constraints
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';

-- Check indexes
SELECT tablename, indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

## Best Practices

### Future Migrations

1. **Use the consolidated schema as base**: New migrations should build on top of version 999
2. **Maintain safety patterns**: Always use `IF NOT EXISTS` patterns
3. **Include proper indexing**: Consider performance implications
4. **Test thoroughly**: Test on both fresh and existing databases
5. **Document changes**: Update this guide with new migration details

### Schema Changes

1. **Additive Changes**: Prefer adding new columns/tables over modifying existing ones
2. **Default Values**: Always provide sensible defaults for new columns
3. **Null Safety**: Handle NULL values appropriately
4. **Index Strategy**: Create indexes for new query patterns

## System Integration

### Application Code Updates

After running the migration, ensure your application code is updated:

1. **Model Definitions**: Update TypeScript interfaces and types
2. **Query Updates**: Update queries to use new columns/tables
3. **Service Layer**: Update services to handle new features
4. **Test Updates**: Update tests for new schema

### Environment Variables

Ensure these are set in your `.env.development`:

```bash
# Database connection
DB_NAME=maifarm_dev
DB_USER=maifarm
DB_PASSWORD=maifarm123
DB_HOST=localhost
DB_PORT=5432

# API key encryption
API_KEY_ENCRYPTION_KEY=your-encryption-key-here
```

## Support

If you encounter issues with the migration:

1. **Check the logs**: Migration includes detailed logging
2. **Verify prerequisites**: Ensure PostgreSQL version and extensions
3. **Review backup**: Always have a database backup before migrating
4. **Consult the code**: Review the consolidated migration file for details

The migration system is designed to be robust and safe, but always exercise caution when working with production data.