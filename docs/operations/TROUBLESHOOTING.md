# MaiFarm Troubleshooting Guide

## Quick Diagnostic Tools

```bash
# Diagnose any farm
./scripts/diagnostics/diagnose-farm.sh <farm-id>

# Monitor orchestrator for a farm
./scripts/diagnostics/monitor-orchestrator.sh <farm-id>

# Watch orchestrator output live
./scripts/diagnostics/monitor-orchestrator.sh <farm-id> --tail
```

## Common Issues & Solutions

### 1. No Agent Messages Displayed in Terminal Windows

**Symptoms:**
- Farm shows as "active" but no terminal output
- Agents appear stuck or idle
- Terminal windows show "Waiting for output..."

**Diagnosis:**
```bash
# Check farm health
./scripts/diagnostics/diagnose-farm.sh <farm-id>

# Check orchestrator
./scripts/diagnostics/monitor-orchestrator.sh <farm-id>

# Check backend server
curl http://localhost:4567/api/farms/<farm-id>
```

**Common Causes:**

#### A. Backend Server Not Running
```bash
# Check if server is running
ps aux | grep "node.*api/src/index"

# Start backend
npm run dev
# OR
npm run start
```

#### B. Orchestrator Process Died
```bash
# Check orchestrator status
ps aux | grep "orchestrator.py.*<farm-id>"

# Check orchestrator logs (if process died)
cat /path/to/maifarm/var/maibarn/coordination/<farm-id>-status.json
```

**Solution:**
- If orchestrator died: Agents won't receive new prompts
- The farm will remain "stuck" until manually recovered or restarted

**Recovery:**
```bash
# Option 1: Use recovery API
curl -X POST http://localhost:4567/api/farms/<farm-id>/recover

# Option 2: Manual cleanup
TMUX_TMPDIR=/tmp tmux kill-session -t farm-<short-id>
curl -X POST http://localhost:4567/api/farms/<farm-id>/stop
```

#### C. Agents Stuck at Claude Code Prompt
**Symptoms:**
- Terminal logs show "Claude Code v2.0.15"
- Shows "Large CLAUDE.md will impact performance" warning
- Agents at prompt: `> [Pasted text #1 +23 lines]`

**Solution:**
```bash
# Manually send command to agent
TMUX_TMPDIR=/tmp tmux send-keys -t farm-<short-id>:agents.0 "echo 'Test'" Enter

# Check if it appears in logs
tail -5 /path/to/maifarm/var/maibarn/terminals/<farm-id>/agent-0.log
```

If manual commands work but orchestrator prompts don't:
- Issue: Prompt delivery timing or format
- Fix: Restart farm with simpler prompt
- Workaround: Reduce CLAUDE.md size (currently 47.6k chars)

#### D. WebSocket Not Connected
```bash
# Check WebSocket health
curl http://localhost:4567/api/websocket-health

# Check if frontend connected
# Open browser console and look for:
# - "WebSocket connected" message
# - No WebSocket errors
```

**Frontend Debugging:**
1. Open browser DevTools (F12)
2. Go to Network tab → WS (WebSocket)
3. Look for active connection to `ws://localhost:4567`
4. Check for `terminal:output` events

### 2. Farm Stuck in "Launching" Status

**Symptoms:**
- Farm status remains "launching" indefinitely
- No agents visible in UI
- No terminal output

**Diagnosis:**
```bash
# Check database status
PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c \
  "SELECT id, status, created_at FROM farms WHERE id = '<farm-id>';"

# Check if agents were registered
PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c \
  "SELECT id, name, status FROM agents WHERE farm_id = '<farm-id>';"
```

**Common Causes:**
1. **Tmux session creation failed**
   - Check: `TMUX_TMPDIR=/tmp tmux list-sessions | grep farm`
   - Fix: Ensure tmux server is running, restart if needed

2. **Orchestrator failed to launch**
   - Check: `ps aux | grep orchestrator.py`
   - Fix: Check Python dependencies, API keys

3. **Database transaction stuck**
   - Check: Look for stuck queries in PostgreSQL
   - Fix: Restart database connection

**Recovery:**
```bash
# Force farm to complete
curl -X POST http://localhost:4567/api/farms/<farm-id>/recover

# Or stop and retry
curl -X POST http://localhost:4567/api/farms/<farm-id>/stop
```

### 3. Terminal Streaming Not Working

**Symptoms:**
- Terminal logs exist but not showing in UI
- Log files have content when checked manually
- No `terminal:output` WebSocket events

**Diagnosis:**
```bash
# Check log files
ls -lh /path/to/maifarm/var/maibarn/terminals/<farm-id>/

# Check terminal health
curl http://localhost:4567/api/terminal-health/health/farm/<farm-id>

# Check if RealTimeTerminalStreamService is active
curl http://localhost:4567/api/metrics/terminals/<farm-id>
```

**Common Causes:**
1. **Service not registered for farm**
   - Issue: Farm launch didn't call `realTimeTerminalStreamService.registerFarm()`
   - Fix: Restart farm (registration happens on launch)

2. **File watchers failed**
   - Issue: Too many open files (ulimit)
   - Check: `ulimit -n`
   - Fix: Increase limit: `ulimit -n 4096`

3. **WebSocket room not joined**
   - Issue: Frontend not subscribed to `farm:<id>` room
   - Fix: Check frontend WebSocket connection code

**Manual Test:**
```bash
# Write to log file and see if it streams
echo "TEST MESSAGE $(date)" >> /path/to/maifarm/var/maibarn/terminals/<farm-id>/agent-0.log

# Check WebSocket events in browser console
# Should see: terminal:output with content "TEST MESSAGE"
```

### 4. Agents Not Receiving Prompts

**Symptoms:**
- Agents launch but don't start working
- Logs show Claude Code UI but no task execution
- Orchestrator shows "ready" but agents idle

**Diagnosis:**
```bash
# Check if prompts were received
grep "Pasted text" /path/to/maifarm/var/maibarn/terminals/<farm-id>/agent-*.log

# Check orchestrator status
cat /path/to/maifarm/var/maibarn/coordination/<farm-id>-status.json
```

**Common Causes:**
1. **YAML prompt file not created**
   ```bash
   # Check if prompt YAML exists
   ls -l /path/to/maifarm/var/maibarn/xenosync-sessions/prompt-<farm-id>.yaml
   ```

2. **Prompt too long or has special characters**
   - Issue: Orchestrator couldn't send prompt via tmux
   - Fix: Simplify prompt, avoid special characters

3. **Agents blocked by CLAUDE.md warning**
   - Issue: File size warning requires acknowledgment
   - Fix: Reduce CLAUDE.md size or use `/memory` command

**Manual Prompt Delivery:**
```bash
# Send prompt manually to agent 0
TMUX_TMPDIR=/tmp tmux send-keys -t farm-<short-id>:agents.0 \
  "Your task here" Enter
```

### 5. Orphaned or Zombie Farms

**Symptoms:**
- Farm in database but no tmux session
- Farm shows "running" but nothing happening
- Can't stop or recover farm

**Diagnosis:**
```bash
# Check for orphaned farms
PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c \
  "SELECT id, name, status, created_at FROM farms \
   WHERE status IN ('launching', 'running', 'active') \
   AND updated_at < NOW() - INTERVAL '10 minutes';"
```

**Automatic Recovery:**
- Runs every 2 minutes via `farmRecoveryService`
- Detects stuck farms (no activity for 10+ minutes)
- Cleans up orphaned farms automatically

**Manual Recovery:**
```bash
# Use recovery API
curl -X POST http://localhost:4567/api/farms/<farm-id>/recover

# Check recovery suggestions
curl http://localhost:4567/api/farms/<farm-id>/health
```

## Health Check Checklist

Before launching a new farm, verify:

1. ✓ **Backend server running**
   ```bash
   curl http://localhost:4567/api/health
   ```

2. ✓ **Database accessible**
   ```bash
   PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c "SELECT 1;"
   ```

3. ✓ **Redis running** (if using caching)
   ```bash
   redis-cli ping
   ```

4. ✓ **Tmux server running**
   ```bash
   TMUX_TMPDIR=/tmp tmux list-sessions
   ```

5. ✓ **API keys configured**
   ```bash
   echo $ANTHROPIC_API_KEY | head -c 20
   ```

6. ✓ **Disk space available**
   ```bash
   df -h /path/to/maifarm/var
   ```

7. ✓ **No stuck sessions from previous farms**
   ```bash
   TMUX_TMPDIR=/tmp tmux list-sessions | wc -l
   # Should be reasonable number (<10)
   ```

## Performance Tips

### Reduce Terminal Log Size
```bash
# Clean old terminal logs
find /path/to/maifarm/var/maibarn/terminals \
  -type f -mtime +7 -delete
```

### Monitor Resource Usage
```bash
# Check database connections
PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c \
  "SELECT count(*) FROM pg_stat_activity;"

# Check memory usage
ps aux | grep -E "(node|python|tmux)" | awk '{sum+=$4} END {print sum "%"}'
```

### Optimize for Many Agents
- Use `--fast-launch` flag with orchestrator
- Reduce agent count for initial testing
- Increase NODE_OPTIONS memory if needed

## Emergency Procedures

### Kill All Farms
```bash
# Stop all tmux sessions
TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" | \
  grep "^farm-" | \
  xargs -I {} tmux kill-session -t {}

# Update database
PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c \
  "UPDATE farms SET status = 'stopped' \
   WHERE status IN ('launching', 'running', 'active');"
```

### Reset Everything
```bash
# WARNING: This will destroy all farm data!

# 1. Kill all processes
pkill -f "orchestrator.py"
TMUX_TMPDIR=/tmp tmux kill-server

# 2. Clean database
PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c \
  "TRUNCATE farms, agents, harvests CASCADE;"

# 3. Clean filesystem
rm -rf /path/to/maifarm/var/maibarn/terminals/*
rm -rf /path/to/maifarm/var/maibarn/workspaces/*
rm -rf /path/to/maifarm/var/maibarn/coordination/*

# 4. Restart backend
npm run start
```

## Getting Help

1. **Check logs first:**
   - Backend: Console where `npm run dev` is running
   - Orchestrator: Terminal logs or status files
   - Database: PostgreSQL logs

2. **Run diagnostics:**
   ```bash
   ./scripts/diagnostics/diagnose-farm.sh <farm-id>
   ```

3. **Collect information:**
   - Farm ID
   - Error messages
   - Diagnostic script output
   - Browser console errors

4. **Report issues:**
   - GitHub: https://github.com/your-repo/maifarm/issues
   - Include diagnostic output and logs

## Advanced Debugging

### Enable Verbose Logging
```bash
# Set LOG_LEVEL environment variable
LOG_LEVEL=debug npm run dev
```

### Monitor WebSocket Events
```javascript
// In browser console
const socket = io('http://localhost:4567');
socket.on('terminal:output', (data) => {
  console.log('Terminal output:', data);
});
socket.emit('join-farm', { farmId: '<farm-id>' });
```

### Capture All Orchestrator Output
```bash
# Run orchestrator manually with full logging
python3 scripts/python/orchestrator.py \
  --prompt-file /path/to/prompt.yaml \
  --num-agents 5 \
  --farm-id <farm-id> \
  --session farm-<short-id> \
  --debug \
  2>&1 | tee orchestrator-debug.log
```

## Monitoring Production Deployments

### Set Up Alerts
- Monitor farm launch failures
- Alert on stuck farms (>10 min no activity)
- Track orphaned sessions
- Monitor disk space usage

### Health Monitoring Endpoints
```bash
# Overall system health
curl http://localhost:4567/api/health

# Farm-specific health
curl http://localhost:4567/api/farms/<farm-id>/health

# Terminal streaming health
curl http://localhost:4567/api/terminal-health/health

# Activity monitoring
curl http://localhost:4567/api/metrics/terminals/<farm-id>
```

### Automated Recovery
The system includes automatic recovery for:
- Stuck farms (10+ min no activity)
- Orphaned farms (no tmux session)
- Long-running farms (>24 hours)

Recovery runs every 2 minutes via `farmRecoveryService`.
