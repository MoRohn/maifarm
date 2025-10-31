# Critical Fixes: Orphaned Farms & Real-time Streaming

## 🚨 ROOT CAUSES IDENTIFIED

### 1. Farms Going Orphaned (CRITICAL)

**Problem**: Farms marked as "orphaned" after 2 minutes even though they're actively running with live tmux sessions and Claude processes.

**Root Cause**:
- `farmLifecycleManager.ts:443` - Marks farms orphaned if `last_heartbeat` > 5 minutes old
- `farmLifecycleManager.ts:214` - Heartbeat ONLY updated ONCE when farm becomes active
- **NO continuous heartbeat mechanism exists**

**Evidence**:
```bash
# Farm created 16:38:47, marked orphaned 16:40:47 (2 minutes)
# Tmux session STILL EXISTS: farm-044d90e3
# Orchestrator process STILL RUNNING (confirmed)
# Claude agents STILL WORKING (verified)
```

**Impact**: Users see "orphaned" status despite farm working perfectly, causing confusion and loss of trust.

### 2. No Real-time Streaming (CRITICAL)

**Problem**: Harvest page requires manual refresh to see terminal output. No live streaming experience.

**Root Cause**: WebSocket events not properly connected to terminal file changes.

**Expected Behavior**: Real-time streaming like watching `tail -f` on terminal logs

## ✅ PRODUCTION-READY SOLUTIONS

### Solution 1: Implement Continuous Heartbeat System

**Approach A - Orchestrator Heartbeat (RECOMMENDED)**:
```python
# In orchestrator.py - Add periodic heartbeat to API
def send_heartbeat(farm_id, interval=30):
    while farm_active:
        requests.post(f'{API_URL}/api/farms/{farm_id}/heartbeat')
        time.sleep(interval)
```

**Approach B - Terminal File Watcher Heartbeat**:
```typescript
// In terminalFileWatcherService.ts
private setupHeartbeat(farmId: string) {
  setInterval(async () => {
    await db.query(
      `UPDATE farms SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = $1 AND status IN ('active', 'launching')`,
      [farmId]
    );
  }, 30000); // Every 30 seconds
}
```

**Approach C - Health Monitor Sends Heartbeat (SIMPLEST)**:
```typescript
// In tmuxHealthMonitor.ts - When session detected as healthy
if (sessionHealth.exists && sessionHealth.paneCount === expected) {
  await db.query(
    `UPDATE farms SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = $1`,
    [farmSession.farmId]
  );
}
```

### Solution 2: Enable Real-time WebSocket Streaming

**Current Flow** (BROKEN):
```
Terminal Output → Log File → [NO AUTO-DETECTION] → User Refreshes Page
```

**Fixed Flow** (REAL-TIME):
```
Terminal Output → Log File → File Watcher Detects Change → WebSocket Emits → Frontend Updates
```

**Implementation**:

1. **Ensure File Watcher Active**:
```typescript
// terminalFileWatcherService.ts should emit on EVERY file change
this.watcher.on('change', (filepath) => {
  const content = fs.readFileSync(filepath, 'utf-8');
  websocketManager.emitToRoom(`farm-${farmId}`, 'terminal:output', {
    agentIndex,
    content,
    timestamp: new Date()
  });
});
```

2. **Frontend Must Join Room**:
```typescript
// Harvest page component - on mount
socket.emit('terminal:join', { farmId });

socket.on('terminal:output', (data) => {
  // Update UI immediately without refresh
  setTerminalOutput(prev => [...prev, data]);
});
```

3. **Verify WebSocket Connection**:
```typescript
// Check websocket rooms
io.of('/').adapter.rooms.forEach((_, roomName) => {
  console.log('Active room:', roomName);
});
```

## 🎯 IMMEDIATE ACTION PLAN

### Step 1: Implement Heartbeat (Choose Approach C - Simplest)

**File**: `apps/api/src/services/tmuxHealthMonitor.ts`

Add to `checkSessionHealth()` method:
```typescript
if (health.exists && health.paneCount > 0) {
  // Update heartbeat for healthy sessions
  await db.query(
    `UPDATE farms SET last_heartbeat = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('active', 'launching', 'running')`,
    [farmId]
  );
  logger.debug(`[TmuxHealthMonitor] Updated heartbeat for farm ${farmId}`);
}
```

### Step 2: Fix WebSocket Streaming

**File**: `apps/api/src/services/terminalFileWatcherService.ts`

Ensure events are emitted:
```typescript
private handleFileChange(filepath: string, farmId: string, agentIndex: number) {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\\n').slice(-50); // Last 50 lines

    // Emit to WebSocket immediately
    this.websocketManager.emitToRoom(`farm-${farmId}`, 'terminal:output', {
      farmId,
      agentIndex,
      content: lines.join('\\n'),
      timestamp: new Date().toISOString()
    });

    logger.debug(`Emitted terminal output for farm ${farmId} agent ${agentIndex}`);
  } catch (error) {
    logger.error('Failed to handle file change:', error);
  }
}
```

### Step 3: Frontend Room Joining

**File**: `apps/dashboard/src/pages/HarvestPage.tsx` (or equivalent)

```typescript
useEffect(() => {
  // Join farm-specific room
  socket.emit('terminal:join', { farmId });

  // Listen for real-time updates
  socket.on('terminal:output', handleTerminalUpdate);
  socket.on('farm:status', handleStatusUpdate);

  return () => {
    socket.off('terminal:output');
    socket.off('farm:status');
  };
}, [farmId]);
```

## 📊 VALIDATION CHECKLIST

After fixes:
- [ ] Create new farm
- [ ] Verify farm stays "active" for full timeout (no orphaning)
- [ ] Verify terminal output appears WITHOUT page refresh
- [ ] Verify heartbeat updated every 30-60 seconds
- [ ] Verify tmux sessions remain healthy
- [ ] Verify status transitions: launching → active → completed

## 🔧 MAINTENANCE

**Monitoring**:
- Add metric: `farm_heartbeat_lag` (time since last heartbeat)
- Add alert: If heartbeat lag > 2 minutes for active farm
- Add dashboard: Show heartbeat status for all active farms

**Testing**:
- Integration test: Farm runs for 10 minutes without going orphaned
- WebSocket test: Terminal output streams in real-time
- Load test: 10 concurrent farms with real-time streaming
