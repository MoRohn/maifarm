# MaiFarm Production Runbook

**Version:** 2.5.0
**Last Updated:** January 2025
**Maintainer:** Production Engineering Team

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [System Architecture](#system-architecture)
3. [Monitoring & Alerts](#monitoring--alerts)
4. [Common Operations](#common-operations)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [Emergency Procedures](#emergency-procedures)
7. [Performance Tuning](#performance-tuning)
8. [Backup & Recovery](#backup--recovery)

---

## Quick Reference

### Critical Endpoints

```bash
# System Health
GET /api/farm-lifecycle/health

# Active Alerts
GET /api/farm-lifecycle/alerts

# Stuck Farms
GET /api/farm-lifecycle/stuck

# Recovery Stats
GET /api/farm-lifecycle/recovery/stats
```

### Emergency Commands

```bash
# Check system status
curl http://localhost:4567/api/farm-lifecycle/health | jq '.status'

# Force complete stuck farm
curl -X POST http://localhost:4567/api/farm-lifecycle/recovery/trigger/<farm-id> \
  -H "Content-Type: application/json" \
  -d '{"action": "force-complete"}'

# Restart service
pm2 restart ecosystem.config.js

# View logs
pm2 logs --lines 100
```

### Key Metrics Thresholds

| Metric | Healthy | Degraded | Critical |
|--------|---------|----------|----------|
| Completion Rate | ≥90% | 70-90% | <70% |
| Stuck Farms | 0 | 1-4 | ≥5 |
| Response Time | <100ms | 100-200ms | >200ms |
| Error Rate | <1% | 1-5% | >5% |

---

## System Architecture

### Service Components

```
┌─────────────────┐
│  Load Balancer  │
└────────┬────────┘
         │
    ┌────▼────┐
    │  Nginx  │
    └────┬────┘
         │
    ┌────▼────────────────────┐
    │  Node.js API (port 4567)│
    │  - Express              │
    │  - Socket.io            │
    │  - State Machine        │
    │  - Auto Recovery        │
    └────┬────────────────────┘
         │
    ┌────▼────┐     ┌──────────┐
    │   DB    │     │  Redis   │
    │  (PG)   │     │  (Cache) │
    └─────────┘     └──────────┘
```

### Critical Services

1. **Farm Lifecycle State Machine**
   - Validates state transitions
   - Tracks transition history
   - Emits lifecycle events

2. **Automated Farm Recovery**
   - Monitors farms every 2 minutes
   - Auto-recovers stuck/orphaned farms
   - Integrates with state machine

3. **Orchestrator Bridge**
   - Dual-mode completion detection
   - File watcher + polling fallback
   - 100% completion guarantee

4. **Harvest Service**
   - Auto-recovery for missing harvests
   - Guaranteed yield generation
   - Summary creation

---

## Monitoring & Alerts

### Health Monitoring

**Primary Health Endpoint:**
```bash
curl -s http://localhost:4567/api/farm-lifecycle/health | jq '.'
```

**Response Structure:**
```json
{
  "status": "healthy|degraded|critical",
  "metrics": {
    "totalFarms": 45,
    "activeFarms": 12,
    "completedFarms": 30,
    "failedFarms": 3,
    "orphanedFarms": 0,
    "stuckFarms": 0,
    "completionRate": 90.91
  },
  "recommendations": ["✅ System operating normally"]
}
```

### Alert Types

#### 1. Stuck Launching (WARNING)
**Trigger:** Farm in `launching` state for >10 minutes

**Check:**
```bash
curl -s http://localhost:4567/api/farm-lifecycle/alerts | \
  jq '.alerts[] | select(.type=="stuck_launching")'
```

**Action:**
```bash
# Get farm details
curl -s http://localhost:4567/api/farm-lifecycle/transitions/<farm-id> | jq '.'

# Check tmux session
TMUX_TMPDIR=/tmp tmux list-sessions | grep farm-<farm-id>

# Force fail if necessary
curl -X POST http://localhost:4567/api/farm-lifecycle/recovery/trigger/<farm-id> \
  -H "Content-Type: application/json" \
  -d '{"action": "force-fail"}'
```

#### 2. Orphaned Farm (CRITICAL)
**Trigger:** Farm active but no tmux session

**Check:**
```bash
# Get orphaned farms
curl -s http://localhost:4567/api/farm-lifecycle/alerts | \
  jq '.alerts[] | select(.type=="orphaned")'
```

**Action:**
Automated recovery will handle this automatically. Manual override:
```bash
curl -X POST http://localhost:4567/api/farm-lifecycle/recovery/trigger/<farm-id> \
  -H "Content-Type: application/json" \
  -d '{"action": "force-fail"}'
```

#### 3. High Failure Rate (CRITICAL)
**Trigger:** >30% of farms failed in last hour

**Check:**
```bash
# Get failure statistics
psql -U maifarm -d maifarm_dev -c "
  SELECT
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
  FROM farms
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY status;"
```

**Action:**
1. Check orchestrator logs: `pm2 logs --lines 500 | grep ERROR`
2. Verify API keys: Check `.env.production` for valid keys
3. Check system resources: `htop`, `df -h`, `free -h`
4. Review recent changes: `git log --oneline -20`

#### 4. Long Running Farms (INFO)
**Trigger:** Farm running for >2 hours

**Check:**
```bash
# Get long-running farms
psql -U maifarm -d maifarm_dev -c "
  SELECT id, name, status,
         EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as runtime_minutes
  FROM farms
  WHERE status = 'running'
    AND created_at < NOW() - INTERVAL '2 hours'
  ORDER BY created_at ASC;"
```

**Action:**
Verify timeout is configured correctly. If needed, force complete:
```bash
curl -X POST http://localhost:4567/api/farm-lifecycle/recovery/trigger/<farm-id> \
  -H "Content-Type: application/json" \
  -d '{"action": "force-complete"}'
```

### Monitoring Dashboard URLs

```bash
# Overall health
http://localhost:4567/api/farm-lifecycle/health

# Active alerts
http://localhost:4567/api/farm-lifecycle/alerts

# Stuck farms
http://localhost:4567/api/farm-lifecycle/stuck?threshold=30

# Recovery statistics
http://localhost:4567/api/farm-lifecycle/recovery/stats

# Recent recovery actions
http://localhost:4567/api/farm-lifecycle/recovery/actions?limit=50
```

---

## Common Operations

### 1. Check Farm Status

```bash
# Get farm by ID
FARM_ID="<farm-id>"
curl -s "http://localhost:4567/api/farms/${FARM_ID}" | jq '.'

# Get farm transition history
curl -s "http://localhost:4567/api/farm-lifecycle/transitions/${FARM_ID}" | jq '.'

# Get all active farms
psql -U maifarm -d maifarm_dev -c "
  SELECT id, name, status, created_at,
         EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as age_minutes
  FROM farms
  WHERE status IN ('launching', 'active', 'running', 'harvesting')
  ORDER BY created_at DESC;"
```

### 2. Manual Farm Recovery

```bash
FARM_ID="<farm-id>"

# Force complete
curl -X POST "http://localhost:4567/api/farm-lifecycle/recovery/trigger/${FARM_ID}" \
  -H "Content-Type: application/json" \
  -d '{"action": "force-complete"}'

# Force fail
curl -X POST "http://localhost:4567/api/farm-lifecycle/recovery/trigger/${FARM_ID}" \
  -H "Content-Type: application/json" \
  -d '{"action": "force-fail"}'
```

### 3. View Harvest Output

```bash
HARVEST_ID="<harvest-id>"

# Get harvest details
curl -s "http://localhost:4567/api/harvests/${HARVEST_ID}" | jq '.'

# Get harvest yield items
curl -s "http://localhost:4567/api/harvests/${HARVEST_ID}" | \
  jq '.yield[] | {id, type, name, size}'
```

### 4. Monitor Automated Recovery

```bash
# Get recovery statistics
curl -s http://localhost:4567/api/farm-lifecycle/recovery/stats | jq '.'

# Output:
{
  "totalAttempts": 45,
  "successfulRecoveries": 42,
  "failedRecoveries": 3,
  "byAction": {
    "force-complete": 25,
    "force-fail": 15,
    "harvest-recovery": 5
  },
  "lastRecovery": "2025-01-08T10:30:00.000Z",
  "isMonitoring": true
}

# Get recent recovery actions
curl -s http://localhost:4567/api/farm-lifecycle/recovery/actions?limit=10 | jq '.'
```

### 5. Control Automated Recovery

```bash
# Start automated recovery
curl -X POST http://localhost:4567/api/farm-lifecycle/recovery/start

# Stop automated recovery
curl -X POST http://localhost:4567/api/farm-lifecycle/recovery/stop

# Check status
curl -s http://localhost:4567/api/farm-lifecycle/recovery/stats | jq '.isMonitoring'
```

---

## Troubleshooting Guide

### Issue: Farm Stuck in Launching

**Symptoms:**
- Farm shows `launching` status for >15 minutes
- No error messages in logs
- Tmux session may or may not exist

**Diagnosis:**
```bash
FARM_ID="<farm-id>"

# 1. Check if tmux session exists
TMUX_TMPDIR=/tmp tmux list-sessions | grep "farm-${FARM_ID}"

# 2. Check orchestrator status file
cat "/var/maibarn/coordination/orchestrator_status_${FARM_ID}.json"

# 3. Check logs
pm2 logs --lines 100 | grep "${FARM_ID}"
```

**Resolution:**
```bash
# If tmux session exists, check panes
TMUX_TMPDIR=/tmp tmux list-panes -t "farm-${FARM_ID}:agents" -F "#{pane_index} #{pane_current_command}"

# If no session, automated recovery will force-fail after 15 minutes
# Or manually trigger:
curl -X POST "http://localhost:4567/api/farm-lifecycle/recovery/trigger/${FARM_ID}" \
  -H "Content-Type: application/json" \
  -d '{"action": "force-fail"}'
```

### Issue: Harvest Collection Fails

**Symptoms:**
- Farm reaches completed status
- No harvest yield generated
- Error in logs about missing harvestId

**Diagnosis:**
```bash
FARM_ID="<farm-id>"

# Check if harvest exists
psql -U maifarm -d maifarm_dev -c "
  SELECT id, name, status, metadata
  FROM harvests
  WHERE farm_id = '${FARM_ID}'
  ORDER BY created_at DESC
  LIMIT 1;"

# Check for auto-recovery metadata
psql -U maifarm -d maifarm_dev -c "
  SELECT id, name, metadata->>'autoRecovery' as auto_recovery
  FROM harvests
  WHERE farm_id = '${FARM_ID}'
    AND metadata @> '{\"autoRecovery\": true}';"
```

**Resolution:**
Auto-recovery should create harvest automatically. If not:
```bash
# Check recovery logs
curl -s http://localhost:4567/api/farm-lifecycle/recovery/actions | \
  jq ".actions[] | select(.farmId==\"${FARM_ID}\")"

# Manually create harvest via API
curl -X POST http://localhost:4567/api/harvests \
  -H "Content-Type: application/json" \
  -d "{\"farmId\": \"${FARM_ID}\", \"name\": \"Manual Recovery Harvest\"}"
```

### Issue: Invalid State Transition

**Symptoms:**
- Error logs showing "Invalid state transition"
- Farm stuck in unexpected state
- State machine rejection events

**Diagnosis:**
```bash
FARM_ID="<farm-id>"

# Get current state and transition history
curl -s "http://localhost:4567/api/farm-lifecycle/transitions/${FARM_ID}" | \
  jq '{currentState, validNextStates, last5Transitions: .transitionHistory[-5:]}'
```

**Resolution:**
```bash
# Check valid next states
curl -s "http://localhost:4567/api/farm-lifecycle/transitions/${FARM_ID}" | \
  jq '.validNextStates'

# Force transition to valid state
curl -X POST "http://localhost:4567/api/farm-lifecycle/force-transition/${FARM_ID}" \
  -H "Content-Type: application/json" \
  -d '{"targetState": "failed", "reason": "Manual recovery from invalid state"}'
```

### Issue: Orphaned Tmux Sessions

**Symptoms:**
- Tmux sessions exist but farms show as completed/failed
- Disk space consumed by orphaned sessions
- Performance degradation

**Diagnosis:**
```bash
# List all tmux sessions
TMUX_TMPDIR=/tmp tmux list-sessions

# Find orphaned sessions (no corresponding farm)
for session in $(TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null); do
  farmId=$(echo $session | sed 's/farm-//')
  exists=$(psql -U maifarm -d maifarm_dev -t -c "SELECT COUNT(*) FROM farms WHERE id='${farmId}' AND status IN ('launching','active','running');")
  if [ "$exists" -eq 0 ]; then
    echo "Orphaned session: $session"
  fi
done
```

**Resolution:**
```bash
# Kill specific orphaned session
TMUX_TMPDIR=/tmp tmux kill-session -t farm-<farm-id>

# Or kill all orphaned sessions (use with caution)
for session in $(TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^farm-"); do
  farmId=$(echo $session | sed 's/farm-//')
  exists=$(psql -U maifarm -d maifarm_dev -t -c "SELECT COUNT(*) FROM farms WHERE id='${farmId}' AND status IN ('launching','active','running');")
  if [ "$exists" -eq 0 ]; then
    echo "Killing orphaned session: $session"
    TMUX_TMPDIR=/tmp tmux kill-session -t "$session"
  fi
done
```

---

## Emergency Procedures

### Procedure 1: Complete System Restart

**When to Use:**
- Critical system failures
- Database connection issues
- Memory leaks
- After configuration changes

**Steps:**
```bash
# 1. Gracefully stop all active farms
curl -X POST http://localhost:4567/api/admin/shutdown-all-farms

# 2. Wait for farms to complete (max 5 minutes)
while [ $(curl -s http://localhost:4567/api/farm-lifecycle/health | jq '.metrics.activeFarms') -gt 0 ]; do
  echo "Waiting for farms to complete..."
  sleep 10
done

# 3. Stop service
pm2 stop ecosystem.config.js

# 4. Clean up orphaned tmux sessions
TMUX_TMPDIR=/tmp tmux kill-server 2>/dev/null || true

# 5. Verify database connectivity
psql -U maifarm -d maifarm_dev -c "SELECT 1;"

# 6. Start service
pm2 start ecosystem.config.js --env production

# 7. Verify health
sleep 5
curl -s http://localhost:4567/api/farm-lifecycle/health | jq '.status'
```

### Procedure 2: Emergency Rollback

**When to Use:**
- New deployment causing critical issues
- Unexpected behavior after update
- Data corruption

**Steps:**
```bash
# 1. Stop current service
pm2 stop ecosystem.config.js

# 2. Checkout previous release
cd /path/to/maifarm
git fetch --tags
git checkout <previous-release-tag>

# 3. Restore dependencies
npm ci --production

# 4. Build application
npm run build

# 5. Start service
pm2 start ecosystem.config.js --env production

# 6. Verify rollback
curl -s http://localhost:4567/api/farm-lifecycle/health
pm2 logs --lines 50
```

### Procedure 3: Database Recovery

**When to Use:**
- Database corruption
- Lost connections
- Migration failures

**Steps:**
```bash
# 1. Stop application
pm2 stop ecosystem.config.js

# 2. Backup current database
pg_dump -U maifarm -d maifarm_dev -F c -f "backup_$(date +%Y%m%d_%H%M%S).dump"

# 3. Check database integrity
psql -U maifarm -d maifarm_dev -c "
  SELECT tablename, schemaname
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;"

# 4. Restore from backup if needed
# pg_restore -U maifarm -d maifarm_dev -c backup_latest.dump

# 5. Run migrations
npm run migrate:up

# 6. Verify schema
psql -U maifarm -d maifarm_dev -c "\d farms"

# 7. Start application
pm2 start ecosystem.config.js --env production
```

---

## Performance Tuning

### Database Optimization

**Index Maintenance:**
```sql
-- Check index usage
SELECT
  schemaname, tablename, indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, tablename;

-- Rebuild indexes
REINDEX TABLE farms;
REINDEX TABLE harvests;
REINDEX TABLE agents;

-- Analyze tables for query planner
ANALYZE farms;
ANALYZE harvests;
ANALYZE agents;
```

**Connection Pooling:**
```javascript
// Current settings (config/database.ts)
pool: {
  min: 2,
  max: 20,
  idleTimeoutMillis: 30000
}

// For high load, increase to:
pool: {
  min: 5,
  max: 50,
  idleTimeoutMillis: 30000
}
```

### Application Optimization

**PM2 Cluster Mode:**
```bash
# Update ecosystem.config.js
module.exports = {
  apps: [{
    name: 'maifarm-api',
    script: './dist/index.js',
    instances: 'max',  // Use all CPU cores
    exec_mode: 'cluster',
    max_memory_restart: '2G'
  }]
};

# Restart with cluster mode
pm2 reload ecosystem.config.js
```

**Memory Optimization:**
```bash
# Monitor memory usage
pm2 monit

# If memory grows:
# 1. Check for memory leaks
node --inspect dist/index.js

# 2. Adjust max-old-space-size
NODE_OPTIONS="--max-old-space-size=4096" pm2 restart ecosystem.config.js
```

---

## Backup & Recovery

### Automated Backups

**Database Backup Script** (`/scripts/backup-db.sh`):
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/maifarm"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="maifarm_dev"

mkdir -p $BACKUP_DIR

# Dump database
pg_dump -U maifarm -d $DB_NAME -F c -f "${BACKUP_DIR}/db_${TIMESTAMP}.dump"

# Compress
gzip "${BACKUP_DIR}/db_${TIMESTAMP}.dump"

# Keep only last 7 days
find $BACKUP_DIR -name "db_*.dump.gz" -mtime +7 -delete

echo "Backup completed: db_${TIMESTAMP}.dump.gz"
```

**Cron Schedule:**
```cron
# Daily at 2 AM
0 2 * * * /path/to/maifarm/scripts/backup-db.sh >> /var/log/maifarm-backup.log 2>&1
```

### Restore from Backup

```bash
# 1. Stop application
pm2 stop ecosystem.config.js

# 2. List available backups
ls -lh /var/backups/maifarm/

# 3. Restore database
gunzip /var/backups/maifarm/db_<timestamp>.dump.gz
pg_restore -U maifarm -d maifarm_dev -c /var/backups/maifarm/db_<timestamp>.dump

# 4. Verify restore
psql -U maifarm -d maifarm_dev -c "SELECT COUNT(*) FROM farms;"

# 5. Start application
pm2 start ecosystem.config.js --env production
```

---

## Appendix

### Log Locations

```bash
# PM2 Logs
~/.pm2/logs/maifarm-api-out.log
~/.pm2/logs/maifarm-api-error.log

# Application Logs (if file logging enabled)
/var/log/maifarm/application.log
/var/log/maifarm/error.log

# Nginx Logs
/var/log/nginx/access.log
/var/log/nginx/error.log

# System Logs
journalctl -u maifarm -n 100 --no-pager
```

### Environment Variables

**Required:**
```bash
NODE_ENV=production
PORT=4567
DATABASE_URL=postgresql://maifarm:password@localhost:5432/maifarm_prod
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
```

**Optional:**
```bash
MAX_AGENTS=50
MAX_FARMS=100
LOG_LEVEL=info
ENABLE_METRICS=true
```

### Contact Information

**On-Call Engineer:** [contact details]
**Team Slack:** #maifarm-production
**Incident Reporting:** incidents@maifarm.com

---

**Document Version:** 1.0
**Last Review:** January 2025
**Next Review:** March 2025
