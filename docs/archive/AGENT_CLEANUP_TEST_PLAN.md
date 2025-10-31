# Agent Cleanup Stability Feature - Test Plan

## Overview
This test plan covers the new stability feature that ensures all agents are properly removed when a farm is deleted, and that agents cannot exist without an active farm.

## Features Implemented

### 1. Backend Agent Cleanup
- **Farm Deletion**: When a farm is deleted, all associated agents are automatically removed
- **XenoSync Process Cleanup**: Stops any running xenosync_cli.py processes
- **Database Cascade**: Foreign key constraint ensures agents are deleted with their farm
- **In-Memory Cleanup**: AgentManager removes agents from memory tracking

### 2. Frontend Event Handling
- **WebSocket Events**: Listens for `farm:cleanup:started`, `farm:cleanup:completed`, `farm:deleted`
- **Store Updates**: Automatically removes agents from UI state when farm is deleted
- **Real-time Updates**: UI reflects agent removal immediately

### 3. Agent Creation Validation
- **Farm Existence Check**: Cannot create agents for non-existent farms
- **Farm Status Validation**: Cannot add agents to completed/failed/stopping farms
- **Database Constraint**: Foreign key prevents orphaned agents

### 4. Periodic Cleanup Service
- **Orphaned Agent Detection**: Finds and removes agents with no corresponding farm
- **Stale Agent Detection**: Marks agents with no heartbeat as error
- **Consistency Checking**: Validates database and memory agent counts match

## Test Cases

### 1. Farm Deletion Tests

#### Test 1.1: Delete Farm with Active Agents
```bash
# Create a farm with agents
curl -X POST http://localhost:4567/api/farms \
  -H "Content-Type: application/json" \
  -d '{"name": "test-farm", "config": {"maxAgents": 3}}'

# Launch XenoSync agents
curl -X POST http://localhost:4567/api/farms/{farmId}/launch \
  -H "Content-Type: application/json" \
  -d '{"numberOfAgents": 3}'

# Wait for agents to be active, then delete farm
curl -X DELETE http://localhost:4567/api/farms/{farmId}
```

**Expected Results:**
- All tmux sessions for agents are terminated
- Agents are removed from database
- WebSocket broadcasts cleanup events
- UI shows no agents for deleted farm

#### Test 1.2: Delete Farm with Multi-Claude Process
```bash
# Create and launch a farm
# Then delete while xenosync_cli.py is running
```

**Expected Results:**
- Multi-claude process is stopped
- Tmux session is killed
- All agents are cleaned up

### 2. Agent Creation Validation Tests

#### Test 2.1: Create Agent for Non-Existent Farm
```bash
curl -X POST http://localhost:4567/api/agents \
  -H "Content-Type: application/json" \
  -d '{"farmId": "fake-uuid", "name": "test-agent"}'
```

**Expected Result:** 400 error - "Farm does not exist"

#### Test 2.2: Create Agent for Completed Farm
```bash
# First mark a farm as completed
# Then try to create an agent for it
```

**Expected Result:** 400 error - "Cannot add agents to a farm with status: completed"

### 3. Cleanup Service Tests

#### Test 3.1: Orphaned Agent Cleanup
```bash
# Manually insert an agent with non-existent farm_id in database
# Wait for cleanup interval (1 minute)
```

**Expected Result:** Agent is automatically removed

#### Test 3.2: Stale Agent Detection
```bash
# Create an agent and don't send heartbeats
# Wait for 5+ minutes
```

**Expected Result:** Agent status changes to 'error'

### 4. WebSocket Event Tests

#### Test 4.1: Farm Deletion Events
1. Open browser developer console
2. Delete a farm with agents
3. Monitor WebSocket messages

**Expected Events:**
- `farm:cleanup:started`
- `farm:cleanup:completed` 
- `farm:deleted`

### 5. UI Integration Tests

#### Test 5.1: Real-time Agent Removal
1. Open dashboard with active farm and agents
2. Delete farm from another browser/API
3. Verify agents disappear from UI without refresh

#### Test 5.2: Multi-Tab Consistency
1. Open dashboard in multiple tabs
2. Delete farm in one tab
3. Verify all tabs update correctly

## Performance Tests

### Test 6.1: Large Farm Deletion
- Create farm with 50+ agents
- Delete farm and measure cleanup time
- Expected: < 5 seconds for complete cleanup

### Test 6.2: Concurrent Farm Deletions
- Create 10 farms with agents each
- Delete all farms simultaneously
- Verify all agents are cleaned up

## Error Handling Tests

### Test 7.1: Cleanup Service Failure
- Stop cleanup service
- Create orphaned agents
- Restart service
- Verify cleanup resumes

### Test 7.2: Database Connection Loss
- Simulate database disconnect during farm deletion
- Verify graceful error handling
- Verify no partial deletions

## Monitoring and Logs

### What to Monitor:
1. Server logs for cleanup messages:
   - `[FarmManager] Removed X agents from farm Y`
   - `[MultiClaude] Farm cleanup completed`
   - `[AgentCleanupService] Running cleanup check`

2. WebSocket messages in browser console

3. Database queries:
   ```sql
   -- Check for orphaned agents
   SELECT a.* FROM agents a 
   LEFT JOIN farms f ON a.farm_id = f.id 
   WHERE f.id IS NULL;
   
   -- Check agent counts by farm
   SELECT farm_id, COUNT(*) FROM agents GROUP BY farm_id;
   ```

## Success Criteria

1. **No Orphaned Agents**: Database never contains agents without valid farms
2. **Clean Process Termination**: All tmux/xenosync_cli processes stop on farm deletion
3. **UI Consistency**: Frontend always reflects accurate agent state
4. **Performance**: Cleanup completes within 5 seconds for typical farms
5. **Error Recovery**: System recovers gracefully from failures

## Testing Commands

```bash
# Run TypeScript compilation to check for errors
npm run typecheck

# Run existing tests
npm test

# Monitor WebSocket events (in browser console)
wsManager.getConnectionStats()

# Check cleanup service (in server logs)
grep "AgentCleanupService" server.log

# Database validation
psql -d maifarm -c "SELECT COUNT(*) FROM agents WHERE farm_id NOT IN (SELECT id FROM farms);"
```
